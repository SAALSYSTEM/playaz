-- PUTT-PROFI: Spiel im Katalog + geprüfte Tagesrangliste (weniger Schläge, bei Gleichstand wer zuerst da war).
-- Alle spielen am selben Tag dieselben 5 Bahnen (Seed = Datum in Berlin, JJJJMMTT).
-- Einträge schreibt nur die Prüf-Funktion (Edge Function "putt-profi-runde" mit service_role), die jede Runde nachspielt.
-- Gleicher Aufbau wie 20261101120000_letzte_bastion.sql; private.aufraeumen = Fassung von dort + Putt-Profi.

insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('putt-profi', 'Putt-Profi', 'puttprofi', 'puttprofi.', '{geschick}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;

create table if not exists private.putt_runden (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tag date not null,
  schlaege smallint not null check (schlaege between 5 and 35),
  par smallint not null check (par between 5 and 30),
  sim_version smallint not null check (sim_version > 0),
  inputs text not null check (char_length(inputs) < 4000),
  created_at timestamptz not null default now()
);
create index if not exists putt_runden_tag on private.putt_runden (tag, schlaege asc, created_at asc);
create index if not exists putt_runden_spieler on private.putt_runden (user_id, tag, schlaege asc);
alter table private.putt_runden enable row level security;

-- Beste Runde je Spieler im Zeitraum ('heute' | 'monat' | 'gesamt', Zeitzone Europe/Berlin).
-- Monat/Gesamt: beste Runde im Verhältnis zu Par (die Tagesrunden haben unterschiedliche Par-Werte).
create or replace function private.putt_wertung(p_zeitraum text)
returns table (user_id uuid, name text, avatar text, schlaege smallint, par smallint, platz bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (l.user_id) l.user_id, l.schlaege, l.par, l.created_at
    from private.putt_runden l
    where l.sim_version = (select max(sim_version) from private.putt_runden)
      and case p_zeitraum
        when 'heute' then l.tag = private.berlin_heute()
        when 'monat' then l.tag >= date_trunc('month', private.berlin_heute())::date
        else true end
    order by l.user_id, l.schlaege - l.par asc, l.schlaege asc, l.created_at asc
  )
  select b.user_id, p.display_name, p.avatar, b.schlaege, b.par, rank() over (order by b.schlaege - b.par asc, b.created_at asc)
  from best b join public.profiles p on p.user_id = b.user_id
$$;

create or replace function public.putt_rangliste(p_zeitraum text default 'heute', p_anzahl integer default 50)
returns table (platz bigint, name text, avatar text, schlaege smallint, par smallint, ich boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare lim integer := least(greatest(coalesce(p_anzahl, 50), 1), 100);
begin
  if p_zeitraum is null or p_zeitraum not in ('heute', 'monat', 'gesamt') then raise exception 'zeitraum_unbekannt'; end if;
  return query
    select w.platz, w.name, w.avatar, w.schlaege, w.par, coalesce(w.user_id = (select auth.uid()), false)
    from private.putt_wertung(p_zeitraum) w
    where w.platz <= lim or w.user_id = (select auth.uid())
    order by w.platz, w.name;
end;
$$;

-- Eintragen (nur Prüf-Funktion). p_seed = Datum der Runde (JJJJMMTT); erlaubt sind heute und gestern (Berliner Zeit).
create or replace function public.putt_eintragen(p_user uuid, p_seed integer, p_schlaege integer, p_par integer, p_version integer, p_inputs text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare tag date;
begin
  if p_user is null or p_seed is null or p_schlaege is null or p_schlaege < 5 or p_schlaege > 35 or p_par is null or p_par < 5 or p_par > 30
     or p_version is null or p_version < 1 or p_inputs is null or char_length(p_inputs) >= 4000 then
    return jsonb_build_object('ok', false, 'grund', 'ungueltig');
  end if;
  begin tag := to_date(p_seed::text, 'YYYYMMDD'); exception when others then return jsonb_build_object('ok', false, 'grund', 'tag'); end;
  if to_char(tag, 'YYYYMMDD')::integer <> p_seed or tag < private.berlin_heute() - 1 or tag > private.berlin_heute() then
    return jsonb_build_object('ok', false, 'grund', 'tag');
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then
    return jsonb_build_object('ok', false, 'grund', 'kein_profil');
  end if;
  if not private.rate_ok('putt', p_user::text, interval '1 minute', 10) then
    return jsonb_build_object('ok', false, 'grund', 'zu_oft');
  end if;
  insert into private.putt_runden (user_id, tag, schlaege, par, sim_version, inputs) values (p_user, tag, p_schlaege, p_par, p_version, p_inputs);
  return jsonb_build_object('ok', true,
    'platz_heute', (select w.platz from private.putt_wertung('heute') w where w.user_id = p_user),
    'spieler_heute', (select count(*) from private.putt_wertung('heute')),
    'platz_monat', (select w.platz from private.putt_wertung('monat') w where w.user_id = p_user));
end;
$$;

revoke all on function private.putt_wertung(text) from public, anon, authenticated;
revoke all on function public.putt_eintragen(uuid, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.putt_eintragen(uuid, integer, integer, integer, integer, text) to service_role;
revoke all on function public.putt_rangliste(text, integer) from public;
grant execute on function public.putt_rangliste(text, integer) to anon, authenticated;

-- Aufräumen: bisheriger Inhalt unverändert, Putt-Profi ergänzt (je Spieler/Tag nur die beste Runde)
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
end;
$$;
