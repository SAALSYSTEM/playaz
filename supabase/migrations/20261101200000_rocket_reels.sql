-- ROCKET REELS: Spiel im Katalog (neue Kategorie „Arcade“) + Space-Coin-Stände für Konten.
-- Erst beim Veröffentlichen ausführen: Die Kategorie erscheint sofort auf der Startseite.
--
-- Sicherheit: Coins von Konten liegen in private.rocket_konten. Browser haben darauf keinen Zugriff (kein Lesen, kein Schreiben).
-- Lesen und Schreiben geht nur über die Edge Function "rocket-reels" (service_role). Sie rechnet jede Aktion selbst mit derselben
-- Spiellogik (engine.js) und echtem Zufall nach; der Browser schickt nur Wünsche ("drehen mit 20", "sichern").
-- Gleichzeitige Anfragen (zwei Tabs, doppeltes Tippen) fängt die Revision ab: gespeichert wird nur, wenn sich der Stand seit dem
-- Lesen nicht geändert hat. So kann nichts doppelt gebucht werden.
-- Eine gemeinsame Währung für alle PlaySaal-Spiele wird hiermit NICHT eingeführt; die Space Coins gelten nur in Rocket Reels.

insert into public.categories (slug, name, rank, active)
values ('arcade', 'Arcade', 8, true)
on conflict (slug) do update set name = excluded.name, active = true;

insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('rocket-reels', 'Rocket Reels', 'rocketreels', 'rocketreels.', '{arcade}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;

create table if not exists private.rocket_konten (
  user_id uuid primary key references auth.users (id) on delete cascade,
  zustand jsonb not null check (jsonb_typeof(zustand) = 'object' and octet_length(zustand::text) < 8000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.rocket_konten enable row level security;
revoke all on private.rocket_konten from public, anon, authenticated;

-- Stand lesen (nur Prüf-Funktion). Kein Stand -> null.
create or replace function public.rocket_laden(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('zustand', k.zustand, 'revision', k.revision) from private.rocket_konten k where k.user_id = p_user
$$;

-- Stand speichern (nur Prüf-Funktion). p_basis = gelesene Revision, 0 = neu anlegen.
-- Antwort: {ok:true, revision} oder {ok:false, grund:'konflikt'|'zu_oft'|'ungueltig'}
create or replace function public.rocket_speichern(p_user uuid, p_basis integer, p_zustand jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare neu integer;
begin
  if p_user is null or p_basis is null or p_basis < 0 or jsonb_typeof(p_zustand) is distinct from 'object' or octet_length(p_zustand::text) >= 8000
     or jsonb_typeof(p_zustand -> 'coins') is distinct from 'number' or (p_zustand ->> 'coins')::numeric < 0 then
    return jsonb_build_object('ok', false, 'grund', 'ungueltig');
  end if;
  if not private.rate_ok('rocket', p_user::text, interval '1 minute', 150) then
    return jsonb_build_object('ok', false, 'grund', 'zu_oft');
  end if;
  if p_basis = 0 then
    insert into private.rocket_konten (user_id, zustand) values (p_user, p_zustand)
    on conflict (user_id) do nothing
    returning revision into neu;
  else
    update private.rocket_konten set zustand = p_zustand, revision = revision + 1, updated_at = now()
    where user_id = p_user and revision = p_basis
    returning revision into neu;
  end if;
  if neu is null then return jsonb_build_object('ok', false, 'grund', 'konflikt'); end if;
  return jsonb_build_object('ok', true, 'revision', neu);
end;
$$;

revoke all on function public.rocket_laden(uuid) from public, anon, authenticated;
revoke all on function public.rocket_speichern(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.rocket_laden(uuid) to service_role;
grant execute on function public.rocket_speichern(uuid, integer, jsonb) to service_role;
