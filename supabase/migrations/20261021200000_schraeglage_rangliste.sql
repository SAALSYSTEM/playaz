-- SCHRÄGLAGE: geprüfte Bestzeiten je Level (kleinere Zeit = besser).
-- Einträge schreibt NUR die Prüf-Funktion "schraeglage-lauf" (Supabase Edge Function), nachdem sie den Lauf
-- mit derselben Physik (sim.js) bitgenau nachgefahren hat. Browser und Nutzer können hier nichts direkt eintragen.
-- Lesen: öffentlich nur über schraeglage_rangliste (Spielername und Zeit, keine Kennung, keine Eingaben).

create table private.schraeglage_laeufe (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  level smallint not null check (level between 1 and 60),
  ms integer not null check (ms between 1000 and 3600000),
  sim_version smallint not null check (sim_version > 0),
  inputs text not null check (char_length(inputs) < 60000),
  created_at timestamptz not null default now()
);
create index schraeglage_laeufe_rang on private.schraeglage_laeufe (level, sim_version, created_at, ms);
create index schraeglage_laeufe_spieler on private.schraeglage_laeufe (user_id, level, ms);
alter table private.schraeglage_laeufe enable row level security;

-- Beste Zeit je Spieler und Level im Zeitraum ('monat' | 'jahr' | 'gesamt', Zeitzone Europe/Berlin).
-- Gewertet wird nur die aktuelle Physik-Version (nach einer Physik-Änderung beginnt die Wertung neu).
create or replace function private.schraeglage_wertung(p_level integer, p_zeitraum text)
returns table (user_id uuid, name text, ms integer, erreicht timestamptz, platz bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with ab as (
    select case p_zeitraum
      when 'monat' then date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
      when 'jahr' then date_trunc('year', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
      else timestamptz '2000-01-01' end as t
  ), best as (
    select distinct on (l.user_id) l.user_id, l.ms, l.created_at
    from private.schraeglage_laeufe l, ab
    where l.level = p_level
      and l.sim_version = (select max(sim_version) from private.schraeglage_laeufe where level = p_level)
      and l.created_at >= ab.t
    order by l.user_id, l.ms asc, l.created_at asc
  )
  select b.user_id, p.display_name, b.ms, b.created_at, rank() over (order by b.ms asc)
  from best b join public.profiles p on p.user_id = b.user_id
$$;

-- Öffentliche Rangliste: Spitze plus eigener Eintrag
create or replace function public.schraeglage_rangliste(p_level integer, p_zeitraum text default 'monat', p_anzahl integer default 50)
returns table (platz bigint, name text, ms integer, erreicht timestamptz, ich boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare lim integer := least(greatest(coalesce(p_anzahl, 50), 1), 100);
begin
  if p_zeitraum is null or p_zeitraum not in ('monat', 'jahr', 'gesamt') then raise exception 'zeitraum_unbekannt'; end if;
  if p_level is null or p_level < 1 or p_level > 60 then raise exception 'level_unbekannt'; end if;
  return query
    select w.platz, w.name, w.ms, w.erreicht, coalesce(w.user_id = (select auth.uid()), false)
    from private.schraeglage_wertung(p_level, p_zeitraum) w
    where w.platz <= lim or w.user_id = (select auth.uid())
    order by w.platz, w.erreicht;
end;
$$;

-- Eintragen: nur für die Prüf-Funktion (service_role). Prüft Profil und Häufigkeit, gibt den Platz zurück.
create or replace function public.schraeglage_eintragen(p_user uuid, p_level integer, p_ms integer, p_version integer, p_inputs text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_level is null or p_level < 1 or p_level > 60 or p_ms is null or p_ms < 1000 or p_ms > 3600000
     or p_version is null or p_version < 1 or p_inputs is null or char_length(p_inputs) >= 60000 then
    return jsonb_build_object('ok', false, 'grund', 'ungueltig');
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then
    return jsonb_build_object('ok', false, 'grund', 'kein_profil');
  end if;
  if not private.rate_ok('schraeglage', p_user::text, interval '1 minute', 6) then
    return jsonb_build_object('ok', false, 'grund', 'zu_oft');
  end if;
  insert into private.schraeglage_laeufe (user_id, level, ms, sim_version, inputs) values (p_user, p_level, p_ms, p_version, p_inputs);
  return jsonb_build_object('ok', true,
    'platz_monat', (select w.platz from private.schraeglage_wertung(p_level, 'monat') w where w.user_id = p_user),
    'spieler_monat', (select count(*) from private.schraeglage_wertung(p_level, 'monat')),
    'platz_jahr', (select w.platz from private.schraeglage_wertung(p_level, 'jahr') w where w.user_id = p_user));
end;
$$;

revoke all on function private.schraeglage_wertung(integer, text) from public, anon, authenticated;
revoke all on function public.schraeglage_eintragen(uuid, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.schraeglage_eintragen(uuid, integer, integer, integer, text) to service_role;
revoke all on function public.schraeglage_rangliste(integer, text, integer) from public;
grant execute on function public.schraeglage_rangliste(integer, text, integer) to anon, authenticated;

-- Aufräumen: pro Spieler und Level nur die beste Zeit je Monat behalten (die Zeitreihe reicht für Monats-/Jahreswertung)
create or replace function private.aufraeumen()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from private.rate_limits where window_start < now() - interval '2 days';
  delete from private.stat_seen where day < (now() at time zone 'Europe/Berlin')::date - 2;
  delete from private.stat_daily where day < (now() at time zone 'Europe/Berlin')::date - 400;
  delete from private.bug_reports where status = 'erledigt' and updated_at < now() - interval '180 days';
  delete from private.schraeglage_laeufe l
  where exists (
    select 1 from private.schraeglage_laeufe b
    where b.user_id = l.user_id and b.level = l.level and b.sim_version = l.sim_version
      and date_trunc('month', b.created_at at time zone 'Europe/Berlin') = date_trunc('month', l.created_at at time zone 'Europe/Berlin')
      and (b.ms < l.ms or (b.ms = l.ms and b.id < l.id)));
end;
$$;
