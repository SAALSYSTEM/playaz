-- PlaySaal Grundlage: Spiele, Kategorien, Profile, Spielstände, Favoriten, Fehlermeldungen, Statistik, Admins.
-- Nicht destruktiv: legt nur neue Objekte an. Über die öffentliche API erreichbar ist nur das Schema "public";
-- alles Interne liegt in "private" und wird ausschließlich über geprüfte Funktionen angesprochen.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Interne Hilfen: Einstellungen, Ratenbegrenzung, Admins
-- ---------------------------------------------------------------------------
create table private.settings (
  name text primary key,
  value text not null
);
-- Zufälliges Salz für das tägliche Hashen der IP-Adresse (nur zur Spam-Begrenzung, nie gespeichert im Klartext)
insert into private.settings (name, value)
values ('ip_salt', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create table private.rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, key, window_start)
);

create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Schlüssel für anonyme Begrenzung: SHA-256 aus IP + geheimem Salz + Tag. Nicht rückrechenbar, wechselt täglich.
create or replace function private.client_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h json;
  ip text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    h := null;
  end;
  ip := coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unbekannt');
  return encode(extensions.digest(ip || '|' || (select value from private.settings where name = 'ip_salt') || '|' || current_date::text, 'sha256'), 'hex');
end;
$$;

-- true, solange in diesem Zeitfenster weniger als p_max Treffer gezählt wurden (zählt den aktuellen mit)
create or replace function private.rate_ok(p_bucket text, p_key text, p_window interval, p_max integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
  n integer;
begin
  insert into private.rate_limits as r (bucket, key, window_start, hits)
  values (p_bucket, p_key, w, 1)
  on conflict (bucket, key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  return n <= p_max;
end;
$$;

-- Aufbewahrung: Sperrlisten 2 Tage, Tageswerte 400 Tage, erledigte Fehlermeldungen 180 Tage
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
end;
$$;

create or replace function public.ist_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admins where user_id = (select auth.uid()));
$$;

create or replace function private.admin_pflicht()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (select 1 from private.admins where user_id = (select auth.uid())) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Öffentliche Stammdaten: Kategorien und Spiele (nur lesbar, Pflege über Admin-Funktionen)
-- ---------------------------------------------------------------------------
create table public.categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 2 and 40),
  rank smallint not null default 0,
  active boolean not null default true
);

create table public.games (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  save_id text not null unique check (save_id ~ '^[a-z0-9-]{2,40}$'),
  save_prefix text not null check (save_prefix ~ '^[a-z]+\.$'),
  categories text[] not null default '{}',
  hot boolean not null default false,
  hot_rank smallint,
  listed boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.games enable row level security;
create policy "Kategorien lesen" on public.categories for select to anon, authenticated using (true);
create policy "Spiele lesen" on public.games for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.categories, public.games from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profile (öffentlicher Spielername + Avatar; keine Klarnamen, keine E-Mail)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (display_name ~ '^[A-Za-z0-9ÄÖÜäöüß][A-Za-z0-9ÄÖÜäöüß _.-]{1,18}[A-Za-z0-9ÄÖÜäöüß]$'),
  avatar text not null default 'a1' check (avatar ~ '^a([1-9]|1[0-2])$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_name_eindeutig on public.profiles (lower(display_name));

alter table public.profiles enable row level security;
-- Vorerst sieht jeder nur das eigene Profil. Für spätere Ranglisten/Freunde wird ein eigener öffentlicher View ergänzt.
create policy "Eigenes Profil lesen" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
revoke all on public.profiles from anon;

-- ---------------------------------------------------------------------------
-- Spielstände (privat, je Nutzer und Spiel ein Stand mit Revisionsnummer gegen Überschreiben)
-- ---------------------------------------------------------------------------
create table public.saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null check (game_id ~ '^[a-z0-9-]{2,40}$'),
  format smallint not null check (format between 1 and 100),
  data jsonb not null check (pg_column_size(data) <= 2000000),
  progress double precision not null default 0,
  summary text not null default '' check (char_length(summary) <= 120),
  revision integer not null default 1,
  device text not null default '' check (char_length(device) <= 40),
  client_saved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.saves enable row level security;
create policy "Eigene Spielstände lesen" on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy "Eigene Spielstände löschen" on public.saves for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update, truncate on public.saves from anon, authenticated;
revoke all on public.saves from anon;

-- ---------------------------------------------------------------------------
-- Favoriten (privat)
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_slug text not null references public.games (slug) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_slug)
);
create index favorites_game on public.favorites (game_slug);

alter table public.favorites enable row level security;
create policy "Eigene Favoriten lesen" on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "Eigene Favoriten anlegen" on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Eigene Favoriten löschen" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));
revoke update, truncate on public.favorites from anon, authenticated;
revoke all on public.favorites from anon;

-- ---------------------------------------------------------------------------
-- Fehlermeldungen und Statistik (intern, nur über Funktionen)
-- ---------------------------------------------------------------------------
create table private.bug_reports (
  id bigint generated always as identity primary key,
  game_slug text not null references public.games (slug) on update cascade on delete cascade,
  version text not null default '' check (char_length(version) <= 40),
  message text not null check (char_length(message) between 3 and 1000),
  context jsonb not null default '{}' check (pg_column_size(context) <= 2000),
  status text not null default 'offen' check (status in ('offen', 'in_arbeit', 'erledigt')),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bug_reports_status on private.bug_reports (status, created_at desc);

-- Nur Tageswerte je Spiel, keine Einzelereignisse, keine Nutzer- oder Geräte-IDs
create table private.stat_daily (
  day date not null,
  game_slug text not null references public.games (slug) on update cascade on delete cascade,
  sessions integer not null default 0,
  starts integer not null default 0,
  completions integer not null default 0,
  play_seconds bigint not null default 0,
  primary key (day, game_slug)
);

-- Kurzlebige Duplikatsperre (zufällige Seitenaufruf-ID, nur im Arbeitsspeicher des Browsers), nach 2 Tagen gelöscht
create table private.stat_seen (
  day date not null,
  sid uuid not null,
  game_slug text not null,
  kind text not null,
  ref text not null default '',
  primary key (day, sid, game_slug, kind, ref)
);

-- ---------------------------------------------------------------------------
-- Funktionen für angemeldete Nutzer
-- ---------------------------------------------------------------------------
create or replace function private.name_pruefen(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  l text;
begin
  if char_length(n) < 3 then return 'zu_kurz'; end if;
  if char_length(n) > 20 then return 'zu_lang'; end if;
  if n !~ '^[A-Za-z0-9ÄÖÜäöüß][A-Za-z0-9ÄÖÜäöüß _.-]{1,18}[A-Za-z0-9ÄÖÜäöüß]$' then return 'zeichen'; end if;
  l := lower(replace(replace(replace(replace(n, ' ', ''), '.', ''), '_', ''), '-', ''));
  if l ~ '(admin|playsaal|moderator|support|offiziell|system|arsch|fick|fotze|hure|nazi|hitler|wichser|schlampe|nutte|spast|fuck|bitch|nigg|neger)' then
    return 'unzulaessig';
  end if;
  return 'ok';
end;
$$;

create or replace function public.profil_speichern(p_name text, p_avatar text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  pruef text;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not private.rate_ok('profil', uid::text, interval '1 hour', 30) then return jsonb_build_object('ok', false, 'fehler', 'zu_oft'); end if;
  pruef := private.name_pruefen(n);
  if pruef <> 'ok' then return jsonb_build_object('ok', false, 'fehler', pruef); end if;
  if coalesce(p_avatar, '') !~ '^a([1-9]|1[0-2])$' then return jsonb_build_object('ok', false, 'fehler', 'avatar'); end if;
  begin
    insert into public.profiles as p (user_id, display_name, avatar)
    values (uid, n, p_avatar)
    on conflict (user_id) do update set display_name = excluded.display_name, avatar = excluded.avatar, updated_at = now();
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'fehler', 'vergeben');
  end;
  return jsonb_build_object('ok', true, 'name', n, 'avatar', p_avatar);
end;
$$;

create or replace function public.name_frei(p_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  pruef text;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  pruef := private.name_pruefen(n);
  if pruef <> 'ok' then return jsonb_build_object('frei', false, 'fehler', pruef); end if;
  if exists (select 1 from public.profiles where lower(display_name) = lower(n) and user_id <> uid) then
    return jsonb_build_object('frei', false, 'fehler', 'vergeben');
  end if;
  return jsonb_build_object('frei', true);
end;
$$;

-- Speichert einen Spielstand nur, wenn die übergebene Basis-Revision noch aktuell ist (sonst: Konflikt mit Serverstand).
create or replace function public.spielstand_speichern(
  p_game text, p_format integer, p_data jsonb, p_progress double precision, p_summary text,
  p_base integer, p_device text, p_saved_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pre text;
  k text;
  v jsonb;
  anzahl integer := 0;
  zeile public.saves;
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if not private.rate_ok('spielstand', uid::text, interval '1 minute', 40) then
    return jsonb_build_object('status', 'zu_oft');
  end if;
  select save_prefix into pre from public.games where save_id = p_game;
  if pre is null then return jsonb_build_object('status', 'ungueltig', 'grund', 'spiel'); end if;
  if p_format is null or p_format < 1 or p_format > 100 then return jsonb_build_object('status', 'ungueltig', 'grund', 'format'); end if;
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data -> 'keys') is distinct from 'object' then
    return jsonb_build_object('status', 'ungueltig', 'grund', 'aufbau');
  end if;
  if octet_length(p_data::text) > 1500000 then return jsonb_build_object('status', 'ungueltig', 'grund', 'groesse'); end if;
  for k, v in select * from jsonb_each(p_data -> 'keys') loop
    anzahl := anzahl + 1;
    if anzahl > 50 or left(k, char_length(pre)) <> pre or k !~ '^[a-z]+\.[A-Za-z0-9.]{1,40}$' or jsonb_typeof(v) <> 'string' then
      return jsonb_build_object('status', 'ungueltig', 'grund', 'schluessel');
    end if;
  end loop;

  if coalesce(p_base, 0) = 0 then
    insert into public.saves (user_id, game_id, format, data, progress, summary, revision, device, client_saved_at)
    values (uid, p_game, p_format, p_data, coalesce(p_progress, 0), left(coalesce(p_summary, ''), 120), 1, left(coalesce(p_device, ''), 40), p_saved_at)
    on conflict (user_id, game_id) do nothing
    returning * into zeile;
  else
    update public.saves set
      format = p_format, data = p_data, progress = coalesce(p_progress, 0), summary = left(coalesce(p_summary, ''), 120),
      revision = revision + 1, device = left(coalesce(p_device, ''), 40), client_saved_at = p_saved_at, updated_at = now()
    where user_id = uid and game_id = p_game and revision = p_base
    returning * into zeile;
  end if;

  if zeile.user_id is null then
    select * into zeile from public.saves where user_id = uid and game_id = p_game;
    return jsonb_build_object('status', 'konflikt', 'server', jsonb_build_object(
      'revision', zeile.revision, 'format', zeile.format, 'data', zeile.data, 'progress', zeile.progress,
      'summary', zeile.summary, 'device', zeile.device, 'client_saved_at', zeile.client_saved_at, 'updated_at', zeile.updated_at));
  end if;
  return jsonb_build_object('status', 'ok', 'revision', zeile.revision, 'updated_at', zeile.updated_at);
end;
$$;

-- Konto löschen: entfernt den Auth-Nutzer; Profil, Spielstände, Favoriten und Adminrecht folgen per ON DELETE CASCADE.
create or replace function public.konto_loeschen(p_bestaetigung text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if p_bestaetigung is distinct from 'LÖSCHEN' then return jsonb_build_object('ok', false, 'fehler', 'bestaetigung'); end if;
  delete from auth.users where id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Öffentliche, begrenzte Eingänge (ohne Anmeldung): Fehler melden, Statistik
-- ---------------------------------------------------------------------------
create or replace function public.fehler_melden(p_game text, p_version text, p_message text, p_context jsonb, p_test boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  key text := private.client_key();
  msg text := regexp_replace(trim(coalesce(p_message, '')), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g');
  ctx jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.games where slug = p_game) then return jsonb_build_object('ok', false, 'fehler', 'spiel'); end if;
  if char_length(msg) < 3 then return jsonb_build_object('ok', false, 'fehler', 'zu_kurz'); end if;
  if char_length(msg) > 1000 then return jsonb_build_object('ok', false, 'fehler', 'zu_lang'); end if;
  if not private.rate_ok('fehler_10min', key, interval '10 minutes', 5)
     or not private.rate_ok('fehler_tag', key, interval '1 day', 20)
     or not private.rate_ok('fehler_global', 'alle', interval '1 day', 1000) then
    return jsonb_build_object('ok', false, 'fehler', 'zu_oft');
  end if;
  -- Nur ausdrücklich erlaubte technische Angaben übernehmen
  if jsonb_typeof(p_context) = 'object' then
    if jsonb_typeof(p_context -> 'ansicht') = 'string' and (p_context ->> 'ansicht') ~ '^[0-9]{2,5}x[0-9]{2,5}$' then ctx := ctx || jsonb_build_object('ansicht', p_context ->> 'ansicht'); end if;
    if jsonb_typeof(p_context -> 'touch') = 'boolean' then ctx := ctx || jsonb_build_object('touch', p_context -> 'touch'); end if;
    if jsonb_typeof(p_context -> 'browser') = 'string' then ctx := ctx || jsonb_build_object('browser', left(regexp_replace(p_context ->> 'browser', '[^A-Za-z0-9 ./]', '', 'g'), 40)); end if;
  end if;
  insert into private.bug_reports (game_slug, version, message, context, is_test)
  values (p_game, left(regexp_replace(coalesce(p_version, ''), '[^A-Za-z0-9 ._-]', '', 'g'), 40), msg, ctx, coalesce(p_test, false));
  if random() < 0.05 then perform private.aufraeumen(); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- p_events: [{ "k": "start"|"level"|"zeit", "r": "Kennung", "s": Sekunden }]
create or replace function public.statistik_melden(p_sid uuid, p_game text, p_events jsonb, p_test boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  tag date := (now() at time zone 'Europe/Berlin')::date;
  e jsonb;
  art text;
  ref text;
  sek integer;
  neu integer;
  n_sitz integer := 0;
  n_start integer := 0;
  n_level integer := 0;
  n_sek integer := 0;
begin
  if coalesce(p_test, false) then return jsonb_build_object('ok', true, 'test', true); end if;
  if p_sid is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 30 then return jsonb_build_object('ok', false); end if;
  if not exists (select 1 from public.games where slug = p_game) then return jsonb_build_object('ok', false); end if;
  if not private.rate_ok('statistik', private.client_key(), interval '10 minutes', 200)
     or not private.rate_ok('statistik_sid', p_sid::text, interval '1 day', 400) then
    return jsonb_build_object('ok', false, 'fehler', 'zu_oft');
  end if;

  insert into private.stat_seen (day, sid, game_slug, kind, ref) values (tag, p_sid, p_game, 'sitzung', '') on conflict do nothing;
  get diagnostics neu = row_count;
  n_sitz := neu;

  for e in select * from jsonb_array_elements(p_events) loop
    art := e ->> 'k';
    ref := left(regexp_replace(coalesce(e ->> 'r', ''), '[^A-Za-z0-9_.-]', '', 'g'), 24);
    if art in ('start', 'level', 'zeit') and ref <> '' then
      insert into private.stat_seen (day, sid, game_slug, kind, ref) values (tag, p_sid, p_game, art, ref) on conflict do nothing;
      get diagnostics neu = row_count;
      if neu = 1 then
        if art = 'start' then n_start := n_start + 1;
        elsif art = 'level' then n_level := n_level + 1;
        else
          sek := least(greatest(coalesce((e ->> 's')::integer, 0), 0), 120);
          n_sek := n_sek + sek;
        end if;
      end if;
    end if;
  end loop;

  if n_sitz + n_start + n_level + n_sek > 0 then
    insert into private.stat_daily as d (day, game_slug, sessions, starts, completions, play_seconds)
    values (tag, p_game, n_sitz, n_start, n_level, n_sek)
    on conflict (day, game_slug) do update set
      sessions = d.sessions + excluded.sessions, starts = d.starts + excluded.starts,
      completions = d.completions + excluded.completions, play_seconds = d.play_seconds + excluded.play_seconds;
  end if;
  if random() < 0.01 then perform private.aufraeumen(); end if;
  return jsonb_build_object('ok', true);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin-Funktionen (serverseitig geprüft)
-- ---------------------------------------------------------------------------
create or replace function public.admin_statistik(p_tage integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Berlin')::date;
  ab date;
  res jsonb;
begin
  perform private.admin_pflicht();
  if p_tage not in (1, 7, 30) then raise exception 'Zeitraum ungültig'; end if;
  ab := heute - (p_tage - 1);
  select jsonb_build_object(
    'von', ab, 'bis', heute,
    'summe', (select jsonb_build_object(
        'sitzungen', coalesce(sum(sessions), 0), 'starts', coalesce(sum(starts), 0),
        'abschluesse', coalesce(sum(completions), 0), 'spielzeit_s', coalesce(sum(play_seconds), 0))
      from private.stat_daily where day >= ab),
    'fehler', (select count(*) from private.bug_reports where not is_test and (created_at at time zone 'Europe/Berlin')::date >= ab),
    'fehler_offen', (select count(*) from private.bug_reports where not is_test and status <> 'erledigt'),
    'konten', (select count(*) from public.profiles),
    'konten_neu', (select count(*) from public.profiles where (created_at at time zone 'Europe/Berlin')::date >= ab),
    'spiele', coalesce((select jsonb_agg(x order by x.starts desc, x.name) from (
        select g.slug, g.name,
          coalesce(sum(d.sessions), 0) as sitzungen, coalesce(sum(d.starts), 0) as starts,
          coalesce(sum(d.completions), 0) as abschluesse, coalesce(sum(d.play_seconds), 0) as spielzeit_s,
          (select count(*) from private.bug_reports b where b.game_slug = g.slug and not b.is_test and (b.created_at at time zone 'Europe/Berlin')::date >= ab) as fehler
        from public.games g left join private.stat_daily d on d.game_slug = g.slug and d.day >= ab
        group by g.slug, g.name) x), '[]'::jsonb),
    'tage', coalesce((select jsonb_agg(t order by t.day) from (
        select day, sum(sessions) as sitzungen, sum(starts) as starts, sum(play_seconds) as spielzeit_s
        from private.stat_daily where day >= ab group by day) t), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

create or replace function public.admin_fehler(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.admin_pflicht();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'spiel', b.game_slug, 'spielname', g.name, 'version', b.version, 'text', b.message,
      'technik', b.context, 'status', b.status, 'test', b.is_test, 'erstellt', b.created_at, 'geaendert', b.updated_at)
      order by b.created_at desc)
    from (select * from private.bug_reports
          where (p_status is null or status = p_status)
          order by created_at desc limit 300) b
    join public.games g on g.slug = b.game_slug), '[]'::jsonb);
end;
$$;

create or replace function public.admin_fehler_status(p_id bigint, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.admin_pflicht();
  if p_status not in ('offen', 'in_arbeit', 'erledigt') then raise exception 'Status ungültig'; end if;
  update private.bug_reports set status = p_status, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.admin_spiel_speichern(p_slug text, p_categories text[], p_hot boolean, p_hot_rank integer, p_listed boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c text;
begin
  perform private.admin_pflicht();
  if cardinality(coalesce(p_categories, '{}')) > 6 then raise exception 'Zu viele Kategorien'; end if;
  foreach c in array coalesce(p_categories, '{}') loop
    if not exists (select 1 from public.categories where slug = c) then raise exception 'Unbekannte Kategorie: %', c; end if;
  end loop;
  update public.games set
    categories = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p_categories, '{}')) x),
    hot = coalesce(p_hot, false),
    hot_rank = case when coalesce(p_hot, false) then least(greatest(coalesce(p_hot_rank, 99), 1), 99) else null end,
    listed = coalesce(p_listed, true),
    updated_at = now()
  where slug = p_slug;
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.admin_kategorie_speichern(p_slug text, p_name text, p_rank integer, p_active boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.admin_pflicht();
  insert into public.categories (slug, name, rank, active)
  values (p_slug, trim(p_name), coalesce(p_rank, 0), coalesce(p_active, true))
  on conflict (slug) do update set name = excluded.name, rank = excluded.rank, active = excluded.active;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte: nichts automatisch, alles ausdrücklich
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

revoke execute on function public.ist_admin(), public.profil_speichern(text, text), public.name_frei(text),
  public.spielstand_speichern(text, integer, jsonb, double precision, text, integer, text, timestamptz),
  public.konto_loeschen(text), public.fehler_melden(text, text, text, jsonb, boolean),
  public.statistik_melden(uuid, text, jsonb, boolean), public.admin_statistik(integer), public.admin_fehler(text),
  public.admin_fehler_status(bigint, text), public.admin_spiel_speichern(text, text[], boolean, integer, boolean),
  public.admin_kategorie_speichern(text, text, integer, boolean)
from public, anon, authenticated;

grant execute on function public.fehler_melden(text, text, text, jsonb, boolean), public.statistik_melden(uuid, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.ist_admin(), public.profil_speichern(text, text), public.name_frei(text),
  public.spielstand_speichern(text, integer, jsonb, double precision, text, integer, text, timestamptz),
  public.konto_loeschen(text), public.admin_statistik(integer), public.admin_fehler(text),
  public.admin_fehler_status(bigint, text), public.admin_spiel_speichern(text, text[], boolean, integer, boolean),
  public.admin_kategorie_speichern(text, text, integer, boolean)
to authenticated;

-- Künftige Funktionen in public nicht automatisch für alle freigeben
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stammdaten
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, rank) values
  ('geschick', 'Geschicklichkeit', 1),
  ('raetsel', 'Rätsel', 2),
  ('aufbau', 'Aufbau', 3),
  ('rennen', 'Rennen', 4),
  ('action', 'Action', 5),
  ('abenteuer', 'Abenteuer', 6),
  ('kinder', 'Für Kinder', 7)
on conflict (slug) do nothing;

insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed) values
  ('schraeglage',       'Schräglage',         'schraeglage',    'schraeglage.',    '{rennen,geschick}',     true,  1, true),
  ('linke-spur',        'Linke Spur',         'linkespur',      'linkespur.',      '{rennen,geschick}',     true,  2, true),
  ('hochstapler',       'Hochstapler',        'hochstapler',    'hochstapler.',    '{geschick}',            true,  3, true),
  ('schwindelfrei',     'Schwindelfrei',      'schwindelfrei',  'schwindelfrei.',  '{geschick}',            true,  4, true),
  ('richtfest',         'Richtfest',          'richtfest',      'richtfest.',      '{abenteuer}',           true,  5, true),
  ('eiszeit',           'Eiszeit',            'eiszeit',        'eiszeit.',        '{aufbau,kinder}',       true,  6, true),
  ('stellwerk',         'Stellwerk',          'stellwerk',      'stellwerk.',      '{raetsel}',             true,  7, true),
  ('wasser-marsch',     'Wasser Marsch!',     'wassermarsch',   'wassermarsch.',   '{geschick,kinder}',     false, null, true),
  ('turmschicht',       'Turmschicht',        'turmschicht',    'turmschicht.',    '{geschick,action}',     false, null, true),
  ('dino-leiterhelden', 'Dino-Leiterhelden',  'dinoleiter',     'dinoleiter.',     '{raetsel,kinder}',      false, null, true),
  ('geisterschloss',    'Geisterschloss',     'geisterschloss', 'geisterschloss.', '{action}',              false, null, true),
  ('kristallrausch',    'Kristallrausch',     'kristallrausch', 'kristallrausch.', '{raetsel,geschick}',    false, null, true),
  ('mysupermarkt',      'MySupermarkt',       'mysupermarkt',   'mysupermarkt.',   '{aufbau}',              false, null, true),
  ('sprungsebi',        'SprungSebi',         'sprungsebi',     'sprungssebi.',    '{geschick,abenteuer}',  false, null, true),
  ('jungle-runner',     'Jungle Runner',      'jungle-runner',  'jungle.',         '{geschick,abenteuer}',  false, null, true),
  ('zahlensturm',       'Zahlensturm',        'zahlensturm',    'zahlensturm.',    '{raetsel,geschick}',    false, null, true),
  ('stammvoelker',      'Stammvölker',        'stammvoelker',   'stammvoelker.',   '{aufbau}',              false, null, true),
  ('sondengaenger',     'Sondengänger',       'sondengaenger',  'sondengaenger.',  '{abenteuer}',           false, null, true),
  ('anbiss',            'Anbiss',             'anbiss',         'anbiss.',         '{abenteuer}',           false, null, true),
  ('hau-die-kakerlake', 'Hau die Kakerlake!', 'kakerlake',      'kakerlake.',      '{geschick,action}',     false, null, true),
  ('blocksaal',         'BlockSaal',          'blocksaal',      'blocksaal.',      '{raetsel}',             false, null, false)
on conflict (slug) do nothing;
