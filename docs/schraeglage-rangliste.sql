-- ENTWURF – nicht aktiv. Ergänzung zur Supabase-Migration auf Branch "rangliste" (20261012000000_rangliste.sql).
-- SCHRÄGLAGE: Bestzeiten je Level. Kleinere Zeit = besser. Einträge schreibt NUR der Prüfdienst
-- (Cloudflare Worker mit service_role), nachdem er den Lauf mit sim.js nachgefahren hat.
-- Der Browser kann hier nichts direkt eintragen.

create table public.schraeglage_laeufe (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  level smallint not null check (level between 1 and 30),
  ms integer not null check (ms between 1000 and 3600000),
  sim_version smallint not null,
  inputs text not null check (char_length(inputs) < 60000),   -- Eingabefolge, damit Läufe später erneut prüfbar sind
  created_at timestamptz not null default now()
);
create index schraeglage_laeufe_rang on public.schraeglage_laeufe (level, created_at, ms);
create index schraeglage_laeufe_spieler on public.schraeglage_laeufe (user_id, level, ms);
alter table public.schraeglage_laeufe enable row level security;
create policy schraeglage_eigene_lesen on public.schraeglage_laeufe for select to authenticated using (user_id = auth.uid());
-- keine insert/update-Policy: nur service_role (Prüfdienst) schreibt

-- Beste Zeit je Spieler, Level und Zeitraum ('monat' | 'jahr' | 'gesamt', Zeitzone Europe/Berlin wie bei public.zeitraum_start)
create function public.schraeglage_wertung(p_level integer, p_zeitraum text)
returns table (user_id uuid, name text, ms integer, erreicht timestamptz, platz bigint)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (l.user_id) l.user_id, l.ms, l.created_at
    from public.schraeglage_laeufe l
    where l.level = p_level and l.created_at >= public.zeitraum_start(p_zeitraum)
    order by l.user_id, l.ms asc, l.created_at asc
  )
  select b.user_id, p.name, b.ms, b.created_at, rank() over (order by b.ms asc)
  from best b join public.profiles p on p.id = b.user_id
$$;

-- Öffentliche Rangliste: Spitze plus eigener Eintrag
create function public.schraeglage_rangliste(p_level integer, p_zeitraum text default 'monat', p_anzahl integer default 50)
returns table (platz bigint, name text, ms integer, erreicht timestamptz, ich boolean)
language plpgsql stable security definer set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_anzahl, 50), 1), 100);
begin
  if p_zeitraum not in ('monat', 'jahr', 'gesamt') then raise exception 'zeitraum_unbekannt'; end if;
  if p_level is null or p_level < 1 or p_level > 30 then raise exception 'level_unbekannt'; end if;
  return query
    select w.platz, w.name, w.ms, w.erreicht, coalesce(w.user_id = auth.uid(), false)
    from public.schraeglage_wertung(p_level, p_zeitraum) w
    where w.platz <= lim or w.user_id = auth.uid()
    order by w.platz, w.erreicht;
end $$;

-- Freunde-Rangliste: erst sinnvoll, wenn es eine Freundschaftstabelle gibt (z. B. public.freunde(user_id, freund_id)).
-- Dann: dieselbe Abfrage mit "where w.user_id in (select freund_id from public.freunde where user_id = auth.uid()) or w.user_id = auth.uid()".

-- Platz nach dem Eintragen (vom Prüfdienst aufgerufen)
create function public.schraeglage_platz(p_user uuid, p_level integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'platz_monat', (select w.platz from public.schraeglage_wertung(p_level, 'monat') w where w.user_id = p_user),
    'spieler_monat', (select count(*) from public.schraeglage_wertung(p_level, 'monat')),
    'platz_jahr', (select w.platz from public.schraeglage_wertung(p_level, 'jahr') w where w.user_id = p_user))
$$;

revoke execute on function public.schraeglage_wertung(integer, text) from public, anon, authenticated;
revoke execute on function public.schraeglage_platz(uuid, integer) from public, anon, authenticated;
grant execute on function public.schraeglage_rangliste(integer, text, integer) to anon, authenticated;

-- Cloud-Spielstand: in public.saves die Spiel-ID 'schraeglage' zulassen (check-Constraint erweitern)
-- und in /assets/playsaal.js unter SPIELSTAND eintragen: keys ['schraeglage.v1'], mischen = je Level bessere Bestzeit,
-- Awards vereinigen (früheres Datum gewinnt), Statistikzähler jeweils Maximum.
