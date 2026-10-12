-- PlaySaal: Accounts, Rangliste, Cloud-Spielstand und Gäste-Statistik
-- Gäste werden nicht gespeichert, nur anonyme Tageszähler (stats_daily).

-- ---------------------------------------------------------------
-- Spielernamen
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint name_laenge check (char_length(name) between 3 and 16),
  constraint name_zeichen check (name ~ '^[A-Za-z0-9ÄÖÜäöüß_.-]+( [A-Za-z0-9ÄÖÜäöüß_.-]+)*$')
);
create unique index profiles_name_klein on public.profiles (lower(name));
alter table public.profiles enable row level security;
create policy profiles_eigenes_lesen on public.profiles for select to authenticated using (id = auth.uid());

-- Grobe Wortliste gegen beleidigende Namen (Teilwort-Treffer, Leetspeak normalisiert)
create function public.name_gesperrt(n text) returns boolean
language sql immutable set search_path = public as $$
  select exists (
    select 1 from unnest(array[
      'arschloch','fick','fotze','hure','nutte','wichs','schlampe','missgeburt','spast','schwuchtel',
      'hitler','nazi','neger','nigg','kanake','penis','vagina','porn','fuck','shit','bitch','cunt','pussy',
      'admin','moderator','playsaal','support'
    ]) as w(wort)
    where replace(translate(lower(n), '013457@$', 'oieastas'), ' ', '') like '%' || w.wort || '%'
  )
$$;

create function public.name_pruefen(p_name text) returns text
language plpgsql stable security definer set search_path = public as $$
declare n text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) < 3 or char_length(n) > 16
     or n !~ '^[A-Za-z0-9ÄÖÜäöüß_.-]+( [A-Za-z0-9ÄÖÜäöüß_.-]+)*$' then return 'ungueltig'; end if;
  if public.name_gesperrt(n) then return 'gesperrt'; end if;
  if exists (select 1 from public.profiles where lower(name) = lower(n)
             and id is distinct from auth.uid()) then return 'vergeben'; end if;
  return 'ok';
end $$;

create function public.name_setzen(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_name, '')); s text;
begin
  if auth.uid() is null then raise exception 'nicht_angemeldet'; end if;
  s := public.name_pruefen(n);
  if s <> 'ok' then return s; end if;
  insert into public.profiles (id, name) values (auth.uid(), n)
    on conflict (id) do update set name = excluded.name;
  return 'ok';
exception when unique_violation then return 'vergeben';
end $$;

create function public.mein_profil() returns table (name text, seit timestamptz)
language sql stable security definer set search_path = public as $$
  select p.name, p.created_at from public.profiles p where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------
-- Läufe (Ranglisten-Grundlage)
-- ---------------------------------------------------------------
create table public.runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (game in ('linke-spur', 'schwindelfrei', 'hochstapler')),
  score integer not null check (score >= 0),
  duration_s integer not null check (duration_s > 0),
  meta jsonb not null default '{}'::jsonb,
  hidden boolean not null default false,   -- unplausible Ergebnisse: gespeichert, aber nicht gelistet
  created_at timestamptz not null default now()
);
create index runs_rangliste on public.runs (game, created_at, score desc) where not hidden;
create index runs_spieler on public.runs (user_id, created_at desc);
alter table public.runs enable row level security;
create policy runs_eigene_lesen on public.runs for select to authenticated using (user_id = auth.uid());

-- Zahl aus jsonb lesen, bei Unsinn 0
create function public.jzahl(j jsonb, k text) returns numeric
language plpgsql immutable as $$
begin
  return coalesce((j ->> k)::numeric, 0);
exception when others then return 0;
end $$;

create function public.zeitraum_start(p_zeitraum text) returns timestamptz
language sql stable as $$
  select case p_zeitraum
    when 'monat' then date_trunc('month', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
    when 'jahr'  then date_trunc('year',  now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
    else '-infinity'::timestamptz end
$$;

-- Bestes Ergebnis je Spieler, Spiel und Zeitraum
create function public.spiel_wertung(p_game text, p_zeitraum text)
returns table (user_id uuid, name text, score integer, erreicht timestamptz, platz bigint)
language sql stable security definer set search_path = public as $$
  with bestwerte as (
    select distinct on (r.user_id) r.user_id, r.score, r.created_at
    from public.runs r
    where r.game = p_game and not r.hidden and r.created_at >= public.zeitraum_start(p_zeitraum)
    order by r.user_id, r.score desc, r.created_at asc
  )
  select b.user_id, p.name, b.score, b.created_at, rank() over (order by b.score desc)
  from bestwerte b join public.profiles p on p.id = b.user_id
$$;

-- Gesamtwertung: Platz 1 = 25 Punkte … Platz 25 = 1 Punkt, je Spiel addiert
create function public.gesamt_wertung(p_zeitraum text)
returns table (user_id uuid, name text, score integer, erreicht timestamptz, platz bigint)
language sql stable security definer set search_path = public as $$
  with punkte as (
    select w.user_id, w.name, greatest(0, 26 - w.platz)::integer as pkt, w.erreicht
    from unnest(array['linke-spur', 'schwindelfrei', 'hochstapler']) as s(spiel)
    cross join lateral public.spiel_wertung(s.spiel, p_zeitraum) w
  )
  select user_id, max(name), sum(pkt)::integer, max(erreicht), rank() over (order by sum(pkt) desc)
  from punkte group by user_id having sum(pkt) > 0
$$;

-- Öffentliche Rangliste: Spitze plus der eigene Eintrag
create function public.rangliste(p_game text, p_zeitraum text default 'monat', p_anzahl integer default 50)
returns table (platz bigint, name text, score integer, erreicht timestamptz, ich boolean)
language plpgsql stable security definer set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_anzahl, 50), 1), 100);
begin
  if p_zeitraum not in ('monat', 'jahr', 'gesamt') then raise exception 'zeitraum_unbekannt'; end if;
  if p_game = 'alle' then
    return query
      select g.platz, g.name, g.score, g.erreicht, coalesce(g.user_id = auth.uid(), false)
      from public.gesamt_wertung(p_zeitraum) g
      where g.platz <= lim or g.user_id = auth.uid()
      order by g.platz, g.erreicht;
  elsif p_game in ('linke-spur', 'schwindelfrei', 'hochstapler') then
    return query
      select g.platz, g.name, g.score, g.erreicht, coalesce(g.user_id = auth.uid(), false)
      from public.spiel_wertung(p_game, p_zeitraum) g
      where g.platz <= lim or g.user_id = auth.uid()
      order by g.platz, g.erreicht;
  else
    raise exception 'spiel_unbekannt';
  end if;
end $$;

-- Ergebnis melden: Plausibilität prüfen, speichern, aktuellen Platz zurückgeben
create function public.lauf_melden(p_game text, p_score integer, p_dauer integer, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m jsonb := coalesce(p_meta, '{}'::jsonb);
  plausibel boolean;
  vorher integer;
  platz_monat bigint; von_monat bigint; platz_ewig bigint;
begin
  if uid is null then raise exception 'nicht_angemeldet'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'kein_name'; end if;
  if p_game not in ('linke-spur', 'schwindelfrei', 'hochstapler') then raise exception 'spiel_unbekannt'; end if;
  if p_score is null or p_score < 0 or p_score > 50000000 or p_dauer is null or p_dauer < 1 or p_dauer > 21600 then
    raise exception 'lauf_ungueltig';
  end if;
  if exists (select 1 from public.runs where user_id = uid and created_at > now() - interval '4 seconds') then
    raise exception 'zu_schnell';
  end if;

  plausibel := case p_game
    when 'linke-spur' then
          p_score <= p_dauer * 1000 + public.jzahl(m, 'nm') * 2800 + 5000
      and public.jzahl(m, 'nm') <= p_dauer * 3 + 5
      and public.jzahl(m, 'km') <= p_dauer * 0.115 + 0.5
    when 'schwindelfrei' then p_score <= p_dauer * 12 + 30
    when 'hochstapler' then
          p_score <= public.jzahl(m, 'floors') * 11
      and public.jzahl(m, 'floors') <= p_dauer * 3 + 5
  end;

  select max(score) into vorher from public.runs
    where user_id = uid and game = p_game and not hidden and created_at >= public.zeitraum_start('monat');

  insert into public.runs (user_id, game, score, duration_s, meta, hidden)
  values (uid, p_game, p_score, p_dauer, m, not plausibel);

  if not plausibel then
    return jsonb_build_object('geprueft', true);
  end if;

  select w.platz into platz_monat from public.spiel_wertung(p_game, 'monat') w where w.user_id = uid;
  select count(*) into von_monat from public.spiel_wertung(p_game, 'monat');
  select w.platz into platz_ewig from public.spiel_wertung(p_game, 'gesamt') w where w.user_id = uid;
  return jsonb_build_object(
    'geprueft', false,
    'neuer_monatsbestwert', vorher is null or p_score > vorher,
    'platz_monat', platz_monat, 'spieler_monat', von_monat, 'platz_gesamt', platz_ewig);
end $$;

-- ---------------------------------------------------------------
-- Cloud-Spielstand (nur mit Account)
-- ---------------------------------------------------------------
create table public.saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in ('linke-spur', 'schwindelfrei', 'hochstapler', 'richtfest')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, game),
  constraint spielstand_groesse check (pg_column_size(data) < 65536)
);
alter table public.saves enable row level security;
create policy saves_eigene_lesen on public.saves for select to authenticated using (user_id = auth.uid());
create policy saves_eigene_anlegen on public.saves for insert to authenticated with check (user_id = auth.uid());
create policy saves_eigene_aendern on public.saves for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saves_eigene_loeschen on public.saves for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- Statistik ohne Personenbezug: nur Tageszähler
-- ---------------------------------------------------------------
create table public.stats_daily (
  tag date not null,
  game text not null,
  art text not null,              -- 'besuch' oder 'lauf'
  wiederkehrer boolean not null,
  mit_account boolean not null,
  anzahl integer not null default 0,
  sekunden bigint not null default 0,
  primary key (tag, game, art, wiederkehrer, mit_account)
);
alter table public.stats_daily enable row level security;   -- keine Policies: nur über zaehlen() und das Dashboard

create function public.zaehlen(p_game text, p_art text, p_wiederkehrer boolean default false, p_sekunden integer default 0)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_game not in ('start', 'linke-spur', 'schwindelfrei', 'hochstapler', 'richtfest') or p_art not in ('besuch', 'lauf') then
    return;
  end if;
  insert into public.stats_daily as s (tag, game, art, wiederkehrer, mit_account, anzahl, sekunden)
  values ((now() at time zone 'Europe/Berlin')::date, p_game, p_art, coalesce(p_wiederkehrer, false), auth.uid() is not null,
          1, least(greatest(coalesce(p_sekunden, 0), 0), 14400))
  on conflict (tag, game, art, wiederkehrer, mit_account)
  do update set anzahl = s.anzahl + 1, sekunden = s.sekunden + excluded.sekunden;
end $$;

-- Übersicht fürs Dashboard (SQL-Editor: select * from statistik;)
create view public.statistik with (security_invoker = true) as
select tag, game,
       sum(anzahl) filter (where art = 'besuch') as besuche,
       sum(anzahl) filter (where art = 'besuch' and wiederkehrer) as davon_wiederkehrer,
       sum(anzahl) filter (where art = 'lauf') as laeufe,
       round(sum(sekunden) filter (where art = 'lauf') / 60.0, 1) as spielminuten,
       sum(anzahl) filter (where art = 'lauf' and mit_account) as laeufe_mit_account
from public.stats_daily group by tag, game order by tag desc, game;

-- ---------------------------------------------------------------
-- Account löschen (DSGVO) und Wach-Ping für den Cronjob
-- ---------------------------------------------------------------
create function public.konto_loeschen() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'nicht_angemeldet'; end if;
  delete from auth.users where id = auth.uid();
end $$;

create function public.wach() returns timestamptz
language sql stable as $$ select now() $$;

-- ---------------------------------------------------------------
-- Rechte: interne Funktionen sperren, öffentliche gezielt freigeben
-- ---------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.name_pruefen(text) to anon, authenticated;
grant execute on function public.name_setzen(text) to authenticated;
grant execute on function public.mein_profil() to authenticated;
grant execute on function public.rangliste(text, text, integer) to anon, authenticated;
grant execute on function public.lauf_melden(text, integer, integer, jsonb) to authenticated;
grant execute on function public.zaehlen(text, text, boolean, integer) to anon, authenticated;
grant execute on function public.konto_loeschen() to authenticated;
grant execute on function public.wach() to anon, authenticated;
revoke all on public.statistik from anon, authenticated;
