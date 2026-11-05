-- NEUNMALKLUG (Sudoku): Tagesrätsel mit serverseitigem Seed, genau EIN gewerteter Versuch je Konto und Tag, Zeit von der Datenbankuhr.
-- Wertung: schnellste Zeit (Ausgabe der Runde bis Abschluss); bei gleicher Zeit gleicher Platz. Kein Gesamtranking über Tage.
-- Einträge schreibt nur die Prüf-Funktion (Edge Function "neunmalklug-lauf" mit service_role), die jede Lösung nachrechnet.
-- Gleicher Aufbau wie 20261023200000_leitungschaos.sql; private.aufraeumen = Fassung aus 20261102220000_putt_profi.sql + Neunmalklug.

-- Spiel im Katalog, direkt gelistet (Freigabe "Push direkt Main" am 04.11.2026)
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('neunmalklug', 'Neunmalklug', 'neunmalklug', 'neunmalklug.', '{raetsel}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;

-- Konfigurationsversion für NEUE Tage. Muss zu VERSION in public/spiele/neunmalklug/sim.js passen (tests/db.test.mjs prüft das).
create or replace function private.neunmalklug_version()
returns smallint
language sql
immutable
set search_path = ''
as $$ select 1::smallint $$;

-- Rätsel je Berliner Kalendertag: der Seed wird beim ersten Abruf des Tages zufällig festgelegt und nie geändert.
create table if not exists private.neunmalklug_tage (
  tag date primary key,
  seed integer not null check (seed between 1 and 2147483647),
  version smallint not null check (version > 0),
  created_at timestamptz not null default now()
);
alter table private.neunmalklug_tage enable row level security;

-- Runden: höchstens eine je Konto und Tag (der erste Versuch zählt). finished_at wird genau einmal gesetzt.
create table if not exists private.neunmalklug_runden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tag date not null references private.neunmalklug_tage (tag),
  issued_at timestamptz not null default now(),
  versuche smallint not null default 0,
  finished_at timestamptz,
  zeit_cs integer check (zeit_cs between 0 and 4320000),
  loesung text check (loesung ~ '^[1-9]{81}$'),
  unique (user_id, tag)
);
create index if not exists neunmalklug_runden_tag on private.neunmalklug_runden (tag, zeit_cs) where finished_at is not null;
alter table private.neunmalklug_runden enable row level security;

-- Heutiges Rätsel holen, beim ersten Abruf des Tages anlegen (gleichzeitige Abrufe: der erste gewinnt)
create or replace function private.neunmalklug_tag_holen()
returns private.neunmalklug_tage
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t private.neunmalklug_tage;
  b bytea := extensions.gen_random_bytes(4);
  neu integer;
begin
  neu := 1 + ((((get_byte(b, 0) & 127)::bigint << 24) + (get_byte(b, 1)::bigint << 16) + (get_byte(b, 2)::bigint << 8) + get_byte(b, 3)::bigint) % 2147483646)::integer;
  insert into private.neunmalklug_tage (tag, seed, version) values (private.berlin_heute(), neu, private.neunmalklug_version())
  on conflict (tag) do nothing;
  select * into t from private.neunmalklug_tage where tag = private.berlin_heute();
  return t;
end;
$$;

-- Wertung eines Tages: je Konto der eine Versuch. Gleiche Zeit = gleicher Platz.
create or replace function private.neunmalklug_wertung(p_tag date)
returns table (user_id uuid, name text, avatar text, zeit_cs integer, platz bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id, p.display_name, p.avatar, r.zeit_cs, rank() over (order by r.zeit_cs)
  from private.neunmalklug_runden r join public.profiles p on p.user_id = r.user_id
  where r.tag = p_tag and r.finished_at is not null
$$;

-- Rang eines Spielers an einem Tag samt Abstand (Hundertstel) zum nächstbesseren Platz, oder null ohne Ergebnis
create or replace function private.neunmalklug_meinrang(p_tag date, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (select * from private.neunmalklug_wertung(p_tag)),
  ich as (select * from w where user_id = p_user),
  naechst as (select w.* from w, ich where w.platz < ich.platz order by w.platz desc limit 1)
  select case when exists (select 1 from ich) then jsonb_build_object(
    'platz', (select platz from ich),
    'zeit_cs', (select zeit_cs from ich),
    'spieler', (select count(*) from w),
    'luecke', (select (select zeit_cs from ich) - n.zeit_cs from naechst n),
    'naechster_platz', (select n.platz from naechst n))
  else null end
$$;

-- ---------------------------------------------------------------------------
-- Öffentliche Funktionen
-- ---------------------------------------------------------------------------

-- Heutiges Rätsel (auch für Gäste): Datum, Seed, Konfigurationsversion
create or replace function public.neunmalklug_tag()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare t private.neunmalklug_tage;
begin
  t := private.neunmalklug_tag_holen();
  return jsonb_build_object('tag', to_char(t.tag, 'YYYYMMDD'), 'seed', t.seed, 'version', t.version);
end;
$$;

-- Gewerteten Versuch beginnen oder fortsetzen. Die Uhr läuft ab der ersten Ausgabe (issued_at); "sek" sagt dem Browser,
-- wie lange die Runde schon läuft. Ist der Tag schon gelöst, kommt das Ergebnis zurück (ohne Seed).
create or replace function public.neunmalklug_start()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t private.neunmalklug_tage;
  r private.neunmalklug_runden;
begin
  if uid is null then return jsonb_build_object('ok', false, 'grund', 'nicht_angemeldet'); end if;
  if not exists (select 1 from public.profiles where user_id = uid) then return jsonb_build_object('ok', false, 'grund', 'kein_profil'); end if;
  if not private.rate_ok('neunmalklug_start', uid::text, interval '1 minute', 8) then return jsonb_build_object('ok', false, 'grund', 'zu_oft'); end if;
  t := private.neunmalklug_tag_holen();
  insert into private.neunmalklug_runden (user_id, tag) values (uid, t.tag) on conflict (user_id, tag) do nothing;
  select * into r from private.neunmalklug_runden where user_id = uid and tag = t.tag;
  if r.finished_at is not null then
    return jsonb_build_object('ok', false, 'grund', 'schon_geloest', 'tag', to_char(t.tag, 'YYYYMMDD'), 'zeit_cs', r.zeit_cs,
      'rang', private.neunmalklug_meinrang(t.tag, uid));
  end if;
  return jsonb_build_object('ok', true, 'run_id', r.id, 'tag', to_char(t.tag, 'YYYYMMDD'), 'seed', t.seed, 'version', t.version,
    'sek', round(extract(epoch from now() - r.issued_at)::numeric, 2));
end;
$$;

-- Tagesrangliste: Top p_anzahl, dazu die eigene Platzierung mit je zwei Nachbarn. p_tag = JJJJMMTT oder null (heute).
create or replace function public.neunmalklug_rangliste(p_tag text default null, p_anzahl integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tag date;
  me uuid := (select auth.uid());
  lim integer := least(greatest(coalesce(p_anzahl, 10), 1), 50);
  zeilen jsonb;
  meinepos bigint;
begin
  if p_tag is null then tag := private.berlin_heute();
  else
    begin tag := to_date(p_tag, 'YYYYMMDD'); exception when others then raise exception 'tag_unbekannt'; end;
    if to_char(tag, 'YYYYMMDD') <> p_tag then raise exception 'tag_unbekannt'; end if;
  end if;
  select w.pos into meinepos from (select x.user_id, row_number() over (order by x.platz, x.name) as pos from private.neunmalklug_wertung(tag) x) w where w.user_id = me;
  select coalesce(jsonb_agg(jsonb_build_object('pos', w.pos, 'platz', w.platz, 'name', w.name, 'avatar', w.avatar, 'zeit_cs', w.zeit_cs, 'ich', w.user_id = me) order by w.pos), '[]'::jsonb)
    into zeilen
    from (select x.*, row_number() over (order by x.platz, x.name) as pos from private.neunmalklug_wertung(tag) x) w
    where w.pos <= lim or (meinepos is not null and abs(w.pos - meinepos) <= 2);
  return jsonb_build_object(
    'tag', to_char(tag, 'YYYYMMDD'),
    'spieler', (select count(*) from private.neunmalklug_wertung(tag)),
    'ich', case when me is null then null else private.neunmalklug_meinrang(tag, me) end,
    'zeilen', zeilen);
end;
$$;

-- Tage mit mindestens einem gewerteten Ergebnis, neueste zuerst (Archiv)
create or replace function public.neunmalklug_tage_liste(p_anzahl integer default 60)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_char(t.tag, 'YYYYMMDD') order by t.tag desc), '[]'::jsonb)
  from (select distinct r.tag from private.neunmalklug_runden r where r.finished_at is not null order by r.tag desc limit least(greatest(coalesce(p_anzahl, 60), 1), 400)) t
$$;

-- ---------------------------------------------------------------------------
-- Nur Prüf-Funktion (service_role)
-- ---------------------------------------------------------------------------

-- Seed, Version und Tag zu einer Run-ID lesen. Zählt jeden Abruf als Versuch (höchstens 5).
create or replace function public.neunmalklug_run_lesen(p_user uuid, p_run uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare r private.neunmalklug_runden; t private.neunmalklug_tage;
begin
  if p_user is null or p_run is null then return jsonb_build_object('ok', false, 'grund', 'ungueltig'); end if;
  select * into r from private.neunmalklug_runden where id = p_run and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;
  if r.finished_at is not null then return jsonb_build_object('ok', false, 'grund', 'schon_abgeschlossen'); end if;
  if r.versuche >= 5 then return jsonb_build_object('ok', false, 'grund', 'zu_viele_versuche'); end if;
  update private.neunmalklug_runden set versuche = versuche + 1 where id = p_run;
  select * into t from private.neunmalklug_tage where tag = r.tag;
  return jsonb_build_object('ok', true, 'seed', t.seed, 'version', t.version, 'tag', to_char(t.tag, 'YYYYMMDD'));
end;
$$;

-- Runde abschließen (nur nach bestandener Prüfung). Die Zeit misst die Datenbank: Ausgabe der Runde bis jetzt.
-- Höchstens 12 Stunden; nicht schneller als 10 Sekunden und 0,4 Sekunden je auszufüllendem Feld (schneller tippt kein Mensch).
create or replace function public.neunmalklug_abschliessen(p_user uuid, p_run uuid, p_felder integer, p_loesung text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare r private.neunmalklug_runden; sek numeric; cs integer;
begin
  if p_user is null or p_run is null or p_felder is null or p_felder < 1 or p_felder > 81
     or p_loesung is null or p_loesung !~ '^[1-9]{81}$' then
    return jsonb_build_object('ok', false, 'grund', 'ungueltig');
  end if;
  select * into r from private.neunmalklug_runden where id = p_run and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;
  if r.finished_at is not null then return jsonb_build_object('ok', false, 'grund', 'schon_abgeschlossen'); end if;
  sek := extract(epoch from now() - r.issued_at);
  if sek > 43200 then return jsonb_build_object('ok', false, 'grund', 'abgelaufen'); end if;
  if sek < greatest(10, p_felder * 0.4) then return jsonb_build_object('ok', false, 'grund', 'zu_schnell'); end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then return jsonb_build_object('ok', false, 'grund', 'kein_profil'); end if;
  if not private.rate_ok('neunmalklug', p_user::text, interval '1 minute', 10) then return jsonb_build_object('ok', false, 'grund', 'zu_oft'); end if;
  cs := round(sek * 100)::integer;
  update private.neunmalklug_runden set finished_at = now(), zeit_cs = cs, loesung = p_loesung where id = p_run;
  return jsonb_build_object('ok', true, 'tag', to_char(r.tag, 'YYYYMMDD'), 'zeit_cs', cs, 'rang', private.neunmalklug_meinrang(r.tag, p_user));
end;
$$;

revoke all on function private.neunmalklug_version() from public, anon, authenticated;
revoke all on function private.neunmalklug_tag_holen() from public, anon, authenticated;
revoke all on function private.neunmalklug_wertung(date) from public, anon, authenticated;
revoke all on function private.neunmalklug_meinrang(date, uuid) from public, anon, authenticated;
revoke all on function public.neunmalklug_tag() from public;
grant execute on function public.neunmalklug_tag() to anon, authenticated;
revoke all on function public.neunmalklug_start() from public, anon;
grant execute on function public.neunmalklug_start() to authenticated;
revoke all on function public.neunmalklug_rangliste(text, integer) from public;
grant execute on function public.neunmalklug_rangliste(text, integer) to anon, authenticated;
revoke all on function public.neunmalklug_tage_liste(integer) from public;
grant execute on function public.neunmalklug_tage_liste(integer) to anon, authenticated;
revoke all on function public.neunmalklug_run_lesen(uuid, uuid) from public, anon, authenticated;
grant execute on function public.neunmalklug_run_lesen(uuid, uuid) to service_role;
revoke all on function public.neunmalklug_abschliessen(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.neunmalklug_abschliessen(uuid, uuid, integer, text) to service_role;

-- Aufräumen: bisheriger Inhalt unverändert (Fassung aus 20261102220000_putt_profi.sql), Neunmalklug ergänzt
-- (nie abgeschlossene Runden nach 2 Tagen weg; abgeschlossene bleiben als Archiv)
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
  delete from private.seitenwechsel_laeufe l
  where exists (
    select 1 from private.seitenwechsel_laeufe b
    where b.user_id = l.user_id and b.tag = l.tag and b.sim_version = l.sim_version
      and (b.punkte > l.punkte or (b.punkte = l.punkte and b.id < l.id)));
  delete from private.punktlandung_laeufe l
  where exists (
    select 1 from private.punktlandung_laeufe b
    where b.user_id = l.user_id and b.tag = l.tag and b.sim_version = l.sim_version
      and (b.punkte > l.punkte or (b.punkte = l.punkte and b.id < l.id)));
  delete from private.papierpilot_fluege l
  where exists (
    select 1 from private.papierpilot_fluege b
    where b.user_id = l.user_id and b.tag = l.tag and b.sim_version = l.sim_version
      and (b.cm > l.cm or (b.cm = l.cm and b.ticks < l.ticks) or (b.cm = l.cm and b.ticks = l.ticks and b.id < l.id)));
  delete from private.dartfieber_runden where finished_at is null and issued_at < now() - interval '2 days';
  delete from private.dartfieber_runden l
  where l.finished_at is not null and exists (
    select 1 from private.dartfieber_runden b
    where b.user_id = l.user_id and b.tag = l.tag and b.finished_at is not null
      and (b.punkte > l.punkte or (b.punkte = l.punkte and (b.finished_at < l.finished_at or (b.finished_at = l.finished_at and b.id < l.id)))));
  delete from private.leitungschaos_runden where finished_at is null and issued_at < now() - interval '2 days';
  delete from private.ausfahrt_runden where finished_at is null and issued_at < now() - interval '2 days';
  delete from private.kerkerlauf_laeufe l
  where exists (
    select 1 from private.kerkerlauf_laeufe b
    where b.user_id = l.user_id and b.tag = l.tag and b.sim_version = l.sim_version
      and (b.punkte > l.punkte or (b.punkte = l.punkte and b.takte < l.takte) or (b.punkte = l.punkte and b.takte = l.takte and b.id < l.id)));
  delete from private.bastion_kaempfe l
  where exists (
    select 1 from private.bastion_kaempfe b
    where b.user_id = l.user_id and b.tag = l.tag and b.sim_version = l.sim_version
      and (b.punkte > l.punkte or (b.punkte = l.punkte and b.takte < l.takte) or (b.punkte = l.punkte and b.takte = l.takte and b.id < l.id)));
  delete from private.putt_runden l
  where exists (
    select 1 from private.putt_runden b
    where b.user_id = l.user_id and b.tag = l.tag and b.sim_version = l.sim_version
      and (b.schlaege < l.schlaege or (b.schlaege = l.schlaege and b.id < l.id)));
  delete from private.neunmalklug_runden where finished_at is null and issued_at < now() - interval '2 days';
end;
$$;
