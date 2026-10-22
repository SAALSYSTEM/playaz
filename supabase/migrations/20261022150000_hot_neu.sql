-- Hot automatisch (immer 12 Spiele) und Neu mit Datum.
-- Hot = die 12 Spiele mit der meisten Spielzeit der letzten 30 Tage (private.stat_daily). Spiele ohne Spielzeit werden
-- pro Tag zufällig (aber für alle gleich) einsortiert, damit es immer genau 12 sind. Wird bei jeder Statistik-Meldung
-- neu berechnet (ändert nur Zeilen, die sich wirklich ändern). Neu = hinzugefügt vor höchstens 30 Tagen (Auswertung in katalog.js).
-- Hinweis: Die Hot-Haken im Admin werden dadurch bei der nächsten Berechnung überschrieben.

alter table public.games add column if not exists added_on date not null default (now() at time zone 'Europe/Berlin')::date;

create or replace function private.hot_berechnen()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  heute date := private.berlin_heute();
begin
  with w as (
    select g.slug, g.listed, coalesce(sum(d.play_seconds), 0) as sek
    from public.games g
    left join private.stat_daily d on d.game_slug = g.slug and d.day >= heute - 30
    group by g.slug, g.listed
  ), r as (
    select slug, row_number() over (order by sek desc, md5(slug || heute::text)) as platz from w where listed
  ), ziel as (
    select w.slug, (r.platz <= 12) as hot, case when r.platz <= 12 then r.platz::smallint end as rang
    from w left join r on r.slug = w.slug
  )
  update public.games g
  set hot = coalesce(z.hot, false), hot_rank = z.rang, updated_at = now()
  from ziel z
  where z.slug = g.slug and (g.hot is distinct from coalesce(z.hot, false) or g.hot_rank is distinct from z.rang);
end;
$$;
revoke all on function private.hot_berechnen() from public, anon, authenticated;

create or replace function private.hot_nach_statistik()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hot_berechnen();
  return null;
end;
$$;
revoke all on function private.hot_nach_statistik() from public, anon, authenticated;

drop trigger if exists hot_nach_statistik on private.stat_daily;
create trigger hot_nach_statistik after insert on private.stat_daily
  for each statement execute function private.hot_nach_statistik();

select private.hot_berechnen();
