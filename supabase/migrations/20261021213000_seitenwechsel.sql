-- SEITENWECHSEL: neues Spiel mit geprüfter Tages-Rangliste. Außerdem: Profilbild in den Ranglisten und
-- eine Gesamtwertung für SCHRÄGLAGE. Einträge schreibt nur die Prüf-Funktion (Edge Function mit service_role).

-- ---------------------------------------------------------------------------
-- Spiel im Katalog (Cloud-Spielstände brauchen den Eintrag)
-- ---------------------------------------------------------------------------
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('seitenwechsel', 'Seitenwechsel', 'seitenwechsel', 'seitenwechsel.', '{geschick,action}', false, null, true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- SEITENWECHSEL: Läufe des Tageskurses (höhere Punktzahl = besser)
-- ---------------------------------------------------------------------------
create table private.seitenwechsel_laeufe (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tag date not null,
  punkte integer not null check (punkte between 1 and 1000000),
  ticks integer not null check (ticks between 1 and 72000),
  sim_version smallint not null check (sim_version > 0),
  inputs text not null check (char_length(inputs) < 80000),
  created_at timestamptz not null default now()
);
create index seitenwechsel_laeufe_tag on private.seitenwechsel_laeufe (tag, punkte desc);
create index seitenwechsel_laeufe_spieler on private.seitenwechsel_laeufe (user_id, tag, punkte desc);
alter table private.seitenwechsel_laeufe enable row level security;

create or replace function private.berlin_heute()
returns date language sql stable set search_path = '' as $$ select (now() at time zone 'Europe/Berlin')::date $$;

-- Beste Punktzahl je Spieler im Zeitraum ('heute' | 'monat' | 'gesamt', Zeitzone Europe/Berlin)
create or replace function private.seitenwechsel_wertung(p_zeitraum text)
returns table (user_id uuid, name text, avatar text, punkte integer, platz bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (l.user_id) l.user_id, l.punkte, l.created_at
    from private.seitenwechsel_laeufe l
    where l.sim_version = (select max(sim_version) from private.seitenwechsel_laeufe)
      and case p_zeitraum
        when 'heute' then l.tag = private.berlin_heute()
        when 'monat' then l.tag >= date_trunc('month', private.berlin_heute())::date
        else true end
    order by l.user_id, l.punkte desc, l.created_at asc
  )
  select b.user_id, p.display_name, p.avatar, b.punkte, rank() over (order by b.punkte desc)
  from best b join public.profiles p on p.user_id = b.user_id
$$;

create or replace function public.seitenwechsel_rangliste(p_zeitraum text default 'heute', p_anzahl integer default 50)
returns table (platz bigint, name text, avatar text, punkte integer, ich boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare lim integer := least(greatest(coalesce(p_anzahl, 50), 1), 100);
begin
  if p_zeitraum is null or p_zeitraum not in ('heute', 'monat', 'gesamt') then raise exception 'zeitraum_unbekannt'; end if;
  return query
    select w.platz, w.name, w.avatar, w.punkte, coalesce(w.user_id = (select auth.uid()), false)
    from private.seitenwechsel_wertung(p_zeitraum) w
    where w.platz <= lim or w.user_id = (select auth.uid())
    order by w.platz, w.name;
end;
$$;

-- Eintragen (nur Prüf-Funktion). p_seed ist das Datum des Kurses (JJJJMMTT); erlaubt sind heute und gestern (Berliner Zeit).
create or replace function public.seitenwechsel_eintragen(p_user uuid, p_seed integer, p_punkte integer, p_ticks integer, p_version integer, p_inputs text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare tag date;
begin
  if p_user is null or p_seed is null or p_punkte is null or p_punkte < 1 or p_punkte > 1000000 or p_ticks is null or p_ticks < 1 or p_ticks > 72000
     or p_version is null or p_version < 1 or p_inputs is null or char_length(p_inputs) >= 80000 then
    return jsonb_build_object('ok', false, 'grund', 'ungueltig');
  end if;
  begin tag := to_date(p_seed::text, 'YYYYMMDD'); exception when others then return jsonb_build_object('ok', false, 'grund', 'tag'); end;
  if to_char(tag, 'YYYYMMDD')::integer <> p_seed or tag < private.berlin_heute() - 1 or tag > private.berlin_heute() then
    return jsonb_build_object('ok', false, 'grund', 'tag');
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then
    return jsonb_build_object('ok', false, 'grund', 'kein_profil');
  end if;
  if not private.rate_ok('seitenwechsel', p_user::text, interval '1 minute', 10) then
    return jsonb_build_object('ok', false, 'grund', 'zu_oft');
  end if;
  insert into private.seitenwechsel_laeufe (user_id, tag, punkte, ticks, sim_version, inputs) values (p_user, tag, p_punkte, p_ticks, p_version, p_inputs);
  return jsonb_build_object('ok', true,
    'platz_heute', (select w.platz from private.seitenwechsel_wertung('heute') w where w.user_id = p_user),
    'spieler_heute', (select count(*) from private.seitenwechsel_wertung('heute')),
    'platz_monat', (select w.platz from private.seitenwechsel_wertung('monat') w where w.user_id = p_user));
end;
$$;

revoke all on function private.berlin_heute() from public, anon, authenticated;
revoke all on function private.seitenwechsel_wertung(text) from public, anon, authenticated;
revoke all on function public.seitenwechsel_eintragen(uuid, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.seitenwechsel_eintragen(uuid, integer, integer, integer, integer, text) to service_role;
revoke all on function public.seitenwechsel_rangliste(text, integer) from public;
grant execute on function public.seitenwechsel_rangliste(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- SCHRÄGLAGE: Profilbild in der Rangliste und Gesamtwertung (Anzahl geschaffter Level, dann Summe der Bestzeiten)
-- ---------------------------------------------------------------------------
drop function if exists public.schraeglage_rangliste(integer, text, integer);
drop function if exists private.schraeglage_wertung(integer, text);

create or replace function private.schraeglage_wertung(p_level integer, p_zeitraum text)
returns table (user_id uuid, name text, avatar text, ms integer, erreicht timestamptz, platz bigint)
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
  select b.user_id, p.display_name, p.avatar, b.ms, b.created_at, rank() over (order by b.ms asc)
  from best b join public.profiles p on p.user_id = b.user_id
$$;

create or replace function public.schraeglage_rangliste(p_level integer, p_zeitraum text default 'monat', p_anzahl integer default 50)
returns table (platz bigint, name text, avatar text, ms integer, erreicht timestamptz, ich boolean)
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
    select w.platz, w.name, w.avatar, w.ms, w.erreicht, coalesce(w.user_id = (select auth.uid()), false)
    from private.schraeglage_wertung(p_level, p_zeitraum) w
    where w.platz <= lim or w.user_id = (select auth.uid())
    order by w.platz, w.erreicht;
end;
$$;

-- Gesamtwertung: je Spieler beste Zeit je Level (aktuelle Physik-Version), Rang nach Anzahl Level, dann nach Zeitsumme
create or replace function public.schraeglage_gesamt(p_anzahl integer default 50)
returns table (platz bigint, name text, avatar text, level_anzahl integer, summe_ms bigint, ich boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare lim integer := least(greatest(coalesce(p_anzahl, 50), 1), 100);
begin
  return query
    with je_level as (
      select l.user_id, l.level, min(l.ms) as ms
      from private.schraeglage_laeufe l
      where l.sim_version = (select max(x.sim_version) from private.schraeglage_laeufe x where x.level = l.level)
      group by l.user_id, l.level
    ), summe as (
      select j.user_id, count(*)::integer as n, sum(j.ms)::bigint as s from je_level j group by j.user_id
    ), rang as (
      select s.user_id, p.display_name, p.avatar, s.n, s.s, rank() over (order by s.n desc, s.s asc) as r
      from summe s join public.profiles p on p.user_id = s.user_id
    )
    select r.r, r.display_name, r.avatar, r.n, r.s, coalesce(r.user_id = (select auth.uid()), false)
    from rang r
    where r.r <= lim or r.user_id = (select auth.uid())
    order by r.r, r.display_name;
end;
$$;

revoke all on function private.schraeglage_wertung(integer, text) from public, anon, authenticated;
revoke all on function public.schraeglage_rangliste(integer, text, integer) from public;
grant execute on function public.schraeglage_rangliste(integer, text, integer) to anon, authenticated;
revoke all on function public.schraeglage_gesamt(integer) from public;
grant execute on function public.schraeglage_gesamt(integer) to anon, authenticated;

-- Aufräumen: je Spieler/Level/Monat (SCHRÄGLAGE) und je Spieler/Tag (SEITENWECHSEL) nur die beste Leistung behalten
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
end;
$$;
