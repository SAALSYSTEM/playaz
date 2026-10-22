-- DARTFIEBER: Tageschallenge mit serverseitigem Seed, einmalige Run-ID je Runde, geprüfte Tagesrangliste mit Archiv.
-- Es gibt bewusst KEINE Gesamtrangliste über mehrere Tage (jeder Tag hat andere Bedingungen).
-- Einträge schreibt nur die Prüf-Funktion (Edge Function "dartfieber-lauf" mit service_role), die jede Runde nachrechnet.
-- Baut auf 20261019183000_playsaal_grundlage.sql (rate_ok), 20261021213000_seitenwechsel.sql (private.berlin_heute)
-- und 20261022130000_papierpilot.sql (private.aufraeumen) auf.

-- ---------------------------------------------------------------------------
-- Spiel im Katalog: noch nicht gelistet (Testphase); bei der Freigabe listed = true setzen
-- ---------------------------------------------------------------------------
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('dartfieber', 'Dartfieber', 'dartfieber', 'dartfieber.', '{geschick,action}', false, null, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Konfigurationsversion für NEUE Tage. Muss zu VERSION in public/spiele/dartfieber/sim.js passen (tests/db.test.mjs prüft das).
-- Wird eine Regel geändert: neue Version in sim.js (KONFIG), dann hier erhöhen. Bereits angelegte Tage behalten ihre Version.
-- ---------------------------------------------------------------------------
create or replace function private.dartfieber_version()
returns smallint
language sql
immutable
set search_path = ''
as $$ select 1::smallint $$;

-- ---------------------------------------------------------------------------
-- Challenge je Berliner Kalendertag: der Seed wird beim ersten Abruf des Tages zufällig festgelegt und nie geändert.
-- Aus Seed + Version entstehen alle Bedingungen (Scheibe, Tempo, Wind, Bonusfolge) im Spielcode.
-- ---------------------------------------------------------------------------
create table private.dartfieber_tage (
  tag date primary key,
  seed integer not null check (seed between 1 and 2147483647),
  version smallint not null check (version > 0),
  created_at timestamptz not null default now()
);
alter table private.dartfieber_tage enable row level security;

-- Runden: eine Zeile je ausgegebener Run-ID. finished_at wird genau einmal gesetzt (nach erfolgreicher Prüfung).
create table private.dartfieber_runden (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tag date not null references private.dartfieber_tage (tag),
  issued_at timestamptz not null default now(),
  versuche smallint not null default 0,
  finished_at timestamptz,
  punkte integer check (punkte between 0 and 3000),
  wuerfe smallint check (wuerfe between 1 and 30),
  ticks integer check (ticks between 1 and 54000),
  inputs text check (char_length(inputs) < 2000)
);
create index dartfieber_runden_tag on private.dartfieber_runden (tag, punkte desc) where finished_at is not null;
create index dartfieber_runden_spieler on private.dartfieber_runden (user_id, tag);
alter table private.dartfieber_runden enable row level security;

-- Heutige Challenge holen, beim ersten Abruf des Tages anlegen (gleichzeitige Abrufe: der erste gewinnt)
create or replace function private.dartfieber_tag_holen()
returns private.dartfieber_tage
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t private.dartfieber_tage;
  b bytea := extensions.gen_random_bytes(4);
  neu integer;
begin
  neu := 1 + ((((get_byte(b, 0) & 127)::bigint << 24) + (get_byte(b, 1)::bigint << 16) + (get_byte(b, 2)::bigint << 8) + get_byte(b, 3)::bigint) % 2147483646)::integer;
  insert into private.dartfieber_tage (tag, seed, version) values (private.berlin_heute(), neu, private.dartfieber_version())
  on conflict (tag) do nothing;
  select * into t from private.dartfieber_tage where tag = private.berlin_heute();
  return t;
end;
$$;

-- Beste Runde je Spieler an einem Tag. Gleiche Punktzahl = gleicher Rang. Wer zuerst fertig war, steht bei Gleichstand nur in der Reihenfolge vorn.
create or replace function private.dartfieber_wertung(p_tag date)
returns table (user_id uuid, name text, avatar text, punkte integer, platz bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.punkte, r.finished_at
    from private.dartfieber_runden r
    where r.tag = p_tag and r.finished_at is not null
    order by r.user_id, r.punkte desc, r.finished_at asc
  )
  select b.user_id, p.display_name, p.avatar, b.punkte, rank() over (order by b.punkte desc)
  from best b join public.profiles p on p.user_id = b.user_id
$$;

-- Rang eines Spielers an einem Tag samt Abstand zum nächsten besseren Ergebnis (oder null, wenn noch keine Runde)
create or replace function private.dartfieber_meinrang(p_tag date, p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (select * from private.dartfieber_wertung(p_tag)),
  ich as (select * from w where user_id = p_user),
  naechst as (select min(punkte) as pm from w where punkte > (select punkte from ich))
  select case when exists (select 1 from ich) then jsonb_build_object(
    'platz', (select platz from ich),
    'punkte', (select punkte from ich),
    'spieler', (select count(*) from w),
    'luecke', (select pm - (select punkte from ich) from naechst),
    'naechster_platz', (select platz from w where punkte = (select pm from naechst) limit 1))
  else null end
$$;

-- ---------------------------------------------------------------------------
-- Öffentliche Funktionen
-- ---------------------------------------------------------------------------

-- Heutige Challenge (auch für Gäste): Datum, Seed, Konfigurationsversion
create or replace function public.dartfieber_tag()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare t private.dartfieber_tage;
begin
  t := private.dartfieber_tag_holen();
  return jsonb_build_object('tag', to_char(t.tag, 'YYYYMMDD'), 'seed', t.seed, 'version', t.version);
end;
$$;

-- Neue Runde für das angemeldete Konto: gibt die einmalige Run-ID aus und legt die Runde an die heutige Challenge
create or replace function public.dartfieber_start()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t private.dartfieber_tage;
  rid uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'grund', 'nicht_angemeldet'); end if;
  if not exists (select 1 from public.profiles where user_id = uid) then return jsonb_build_object('ok', false, 'grund', 'kein_profil'); end if;
  if not private.rate_ok('dartfieber_start', uid::text, interval '1 minute', 8) then return jsonb_build_object('ok', false, 'grund', 'zu_oft'); end if;
  t := private.dartfieber_tag_holen();
  insert into private.dartfieber_runden (user_id, tag) values (uid, t.tag) returning id into rid;
  return jsonb_build_object('ok', true, 'run_id', rid, 'tag', to_char(t.tag, 'YYYYMMDD'), 'seed', t.seed, 'version', t.version);
end;
$$;

-- Tagesrangliste: Top p_anzahl, dazu die eigene Platzierung mit je zwei Nachbarn. p_tag = JJJJMMTT oder null (heute). Frühere Tage = Archiv.
create or replace function public.dartfieber_rangliste(p_tag text default null, p_anzahl integer default 10)
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
  select w.pos into meinepos from (select x.user_id, row_number() over (order by x.platz, x.name) as pos from private.dartfieber_wertung(tag) x) w where w.user_id = me;
  select coalesce(jsonb_agg(jsonb_build_object('pos', w.pos, 'platz', w.platz, 'name', w.name, 'avatar', w.avatar, 'punkte', w.punkte, 'ich', w.user_id = me) order by w.pos), '[]'::jsonb)
    into zeilen
    from (select x.*, row_number() over (order by x.platz, x.name) as pos from private.dartfieber_wertung(tag) x) w
    where w.pos <= lim or (meinepos is not null and abs(w.pos - meinepos) <= 2);
  return jsonb_build_object(
    'tag', to_char(tag, 'YYYYMMDD'),
    'spieler', (select count(*) from private.dartfieber_wertung(tag)),
    'ich', case when me is null then null else private.dartfieber_meinrang(tag, me) end,
    'zeilen', zeilen);
end;
$$;

-- Tage mit mindestens einem bestätigten Ergebnis, neueste zuerst (für die Archiv-Ansicht)
create or replace function public.dartfieber_tage_liste(p_anzahl integer default 60)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_char(t.tag, 'YYYYMMDD') order by t.tag desc), '[]'::jsonb)
  from (select distinct r.tag from private.dartfieber_runden r where r.finished_at is not null order by r.tag desc limit least(greatest(coalesce(p_anzahl, 60), 1), 400)) t
$$;

-- ---------------------------------------------------------------------------
-- Nur Prüf-Funktion (service_role)
-- ---------------------------------------------------------------------------

-- Seed und Version zu einer Run-ID lesen. Zählt jeden Abruf als Versuch (höchstens 5), damit niemand Ergebnisse durchprobieren kann.
create or replace function public.dartfieber_run_lesen(p_user uuid, p_run uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare r private.dartfieber_runden; t private.dartfieber_tage;
begin
  if p_user is null or p_run is null then return jsonb_build_object('ok', false, 'grund', 'ungueltig'); end if;
  select * into r from private.dartfieber_runden where id = p_run and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;
  if r.finished_at is not null then return jsonb_build_object('ok', false, 'grund', 'schon_abgeschlossen'); end if;
  if r.versuche >= 5 then return jsonb_build_object('ok', false, 'grund', 'zu_viele_versuche'); end if;
  update private.dartfieber_runden set versuche = versuche + 1 where id = p_run;
  select * into t from private.dartfieber_tage where tag = r.tag;
  return jsonb_build_object('ok', true, 'seed', t.seed, 'version', t.version, 'tag', to_char(t.tag, 'YYYYMMDD'));
end;
$$;

-- Runde abschließen (nur nach bestandener Prüfung durch die Edge Function). Die Run-ID gilt genau einmal.
-- Zeitprüfung mit der Datenbankuhr: Die Runde darf höchstens 30 Minuten alt sein und nicht schneller abgeschlossen werden,
-- als das Spiel selbst lief (Takte / 60 Sekunden, drei Sekunden Toleranz). Der Tag der Runde ist der Tag der Ausgabe.
create or replace function public.dartfieber_abschliessen(p_user uuid, p_run uuid, p_punkte integer, p_wuerfe integer, p_ticks integer, p_inputs text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare r private.dartfieber_runden; sek numeric;
begin
  if p_user is null or p_run is null or p_punkte is null or p_punkte < 0 or p_punkte > 3000 or p_wuerfe is null or p_wuerfe < 1 or p_wuerfe > 30
     or p_ticks is null or p_ticks < 1 or p_ticks > 54000 or p_inputs is null or char_length(p_inputs) >= 2000 then
    return jsonb_build_object('ok', false, 'grund', 'ungueltig');
  end if;
  select * into r from private.dartfieber_runden where id = p_run and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'grund', 'unbekannt'); end if;
  if r.finished_at is not null then return jsonb_build_object('ok', false, 'grund', 'schon_abgeschlossen'); end if;
  sek := extract(epoch from now() - r.issued_at);
  if sek > 1800 then return jsonb_build_object('ok', false, 'grund', 'abgelaufen'); end if;
  if sek < p_ticks / 60.0 - 3 then return jsonb_build_object('ok', false, 'grund', 'zu_schnell'); end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then return jsonb_build_object('ok', false, 'grund', 'kein_profil'); end if;
  if not private.rate_ok('dartfieber', p_user::text, interval '1 minute', 10) then return jsonb_build_object('ok', false, 'grund', 'zu_oft'); end if;
  update private.dartfieber_runden set finished_at = now(), punkte = p_punkte, wuerfe = p_wuerfe, ticks = p_ticks, inputs = p_inputs where id = p_run;
  return jsonb_build_object('ok', true, 'tag', to_char(r.tag, 'YYYYMMDD'), 'rang', private.dartfieber_meinrang(r.tag, p_user));
end;
$$;

revoke all on function private.dartfieber_version() from public, anon, authenticated;
revoke all on function private.dartfieber_tag_holen() from public, anon, authenticated;
revoke all on function private.dartfieber_wertung(date) from public, anon, authenticated;
revoke all on function private.dartfieber_meinrang(date, uuid) from public, anon, authenticated;
revoke all on function public.dartfieber_tag() from public;
grant execute on function public.dartfieber_tag() to anon, authenticated;
revoke all on function public.dartfieber_start() from public, anon;
grant execute on function public.dartfieber_start() to authenticated;
revoke all on function public.dartfieber_rangliste(text, integer) from public;
grant execute on function public.dartfieber_rangliste(text, integer) to anon, authenticated;
revoke all on function public.dartfieber_tage_liste(integer) from public;
grant execute on function public.dartfieber_tage_liste(integer) to anon, authenticated;
revoke all on function public.dartfieber_run_lesen(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dartfieber_run_lesen(uuid, uuid) to service_role;
revoke all on function public.dartfieber_abschliessen(uuid, uuid, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.dartfieber_abschliessen(uuid, uuid, integer, integer, integer, text) to service_role;

-- Aufräumen: bisheriger Inhalt unverändert, Dartfieber ergänzt (nie abgeschlossene Runden nach 2 Tagen weg; je Spieler und Tag
-- bleibt nur die beste Runde, damit die Tagesranglisten als Archiv klein bleiben)
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
end;
$$;
