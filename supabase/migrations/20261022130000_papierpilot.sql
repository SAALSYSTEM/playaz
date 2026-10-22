-- PAPIERPILOT: geprüfte Tages-Rangliste (Distanz, bei Gleichstand kürzere Flugzeit).
-- Einträge schreibt nur die Prüf-Funktion (Edge Function "papierpilot-lauf" mit service_role), die jeden Flug nachfliegt.
-- Baut auf 20261021213000_seitenwechsel.sql (private.berlin_heute) und 20261022070000_punktlandung.sql (private.aufraeumen) auf.

-- ---------------------------------------------------------------------------
-- Spiel im Katalog: noch nicht gelistet (Testphase); bei der Freigabe listed = true setzen
-- ---------------------------------------------------------------------------
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('papierpilot', 'Papierpilot', 'papierpilot', 'papierpilot.', '{geschick,action}', false, null, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Flüge der Tagesstrecke
-- ---------------------------------------------------------------------------
create table private.papierpilot_fluege (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tag date not null,
  cm integer not null check (cm between 100 and 10000000),
  ticks integer not null check (ticks between 1 and 14400),
  sim_version smallint not null check (sim_version > 0),
  inputs text not null check (char_length(inputs) < 80000),
  created_at timestamptz not null default now()
);
create index papierpilot_fluege_tag on private.papierpilot_fluege (tag, cm desc, ticks asc);
create index papierpilot_fluege_spieler on private.papierpilot_fluege (user_id, tag, cm desc);
alter table private.papierpilot_fluege enable row level security;

-- Bester Flug je Spieler im Zeitraum ('heute' | 'monat' | 'gesamt', Zeitzone Europe/Berlin).
-- Reihenfolge: weiter ist besser; bei gleicher Distanz die kürzere Flugzeit; danach wer zuerst da war.
create or replace function private.papierpilot_wertung(p_zeitraum text)
returns table (user_id uuid, name text, avatar text, cm integer, ticks integer, platz bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (f.user_id) f.user_id, f.cm, f.ticks, f.created_at
    from private.papierpilot_fluege f
    where f.sim_version = (select max(sim_version) from private.papierpilot_fluege)
      and case p_zeitraum
        when 'heute' then f.tag = private.berlin_heute()
        when 'monat' then f.tag >= date_trunc('month', private.berlin_heute())::date
        else true end
    order by f.user_id, f.cm desc, f.ticks asc, f.created_at asc
  )
  select b.user_id, p.display_name, p.avatar, b.cm, b.ticks, rank() over (order by b.cm desc, b.ticks asc)
  from best b join public.profiles p on p.user_id = b.user_id
$$;

create or replace function public.papierpilot_rangliste(p_zeitraum text default 'heute', p_anzahl integer default 50)
returns table (platz bigint, name text, avatar text, cm integer, ticks integer, ich boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare lim integer := least(greatest(coalesce(p_anzahl, 50), 1), 100);
begin
  if p_zeitraum is null or p_zeitraum not in ('heute', 'monat', 'gesamt') then raise exception 'zeitraum_unbekannt'; end if;
  return query
    select w.platz, w.name, w.avatar, w.cm, w.ticks, coalesce(w.user_id = (select auth.uid()), false)
    from private.papierpilot_wertung(p_zeitraum) w
    where w.platz <= lim or w.user_id = (select auth.uid())
    order by w.platz, w.name;
end;
$$;

-- Eintragen (nur Prüf-Funktion). p_seed ist das Datum der Strecke (JJJJMMTT); erlaubt sind heute und gestern (Berliner Zeit).
create or replace function public.papierpilot_eintragen(p_user uuid, p_seed integer, p_cm integer, p_ticks integer, p_version integer, p_inputs text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare tag date;
begin
  if p_user is null or p_seed is null or p_cm is null or p_cm < 100 or p_cm > 10000000 or p_ticks is null or p_ticks < 1 or p_ticks > 14400
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
  if not private.rate_ok('papierpilot', p_user::text, interval '1 minute', 10) then
    return jsonb_build_object('ok', false, 'grund', 'zu_oft');
  end if;
  insert into private.papierpilot_fluege (user_id, tag, cm, ticks, sim_version, inputs) values (p_user, tag, p_cm, p_ticks, p_version, p_inputs);
  return jsonb_build_object('ok', true,
    'platz_heute', (select w.platz from private.papierpilot_wertung('heute') w where w.user_id = p_user),
    'spieler_heute', (select count(*) from private.papierpilot_wertung('heute')),
    'platz_monat', (select w.platz from private.papierpilot_wertung('monat') w where w.user_id = p_user));
end;
$$;

revoke all on function private.papierpilot_wertung(text) from public, anon, authenticated;
revoke all on function public.papierpilot_eintragen(uuid, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.papierpilot_eintragen(uuid, integer, integer, integer, integer, text) to service_role;
revoke all on function public.papierpilot_rangliste(text, integer) from public;
grant execute on function public.papierpilot_rangliste(text, integer) to anon, authenticated;

-- Aufräumen: je Spieler/Tag nur den besten Flug behalten (bisheriger Inhalt unverändert, Papierpilot ergänzt)
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
end;
$$;
