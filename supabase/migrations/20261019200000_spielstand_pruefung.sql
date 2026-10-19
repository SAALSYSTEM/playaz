-- Korrektur: Ein Spielstand ohne Feld "keys" wurde bisher nicht abgelehnt (NULL-Vergleich). Jetzt wird er mit grund=aufbau abgewiesen.
-- Nur diese eine Funktion wird ersetzt; keine Daten werden verändert.
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

revoke all on function public.spielstand_speichern(text, integer, jsonb, double precision, text, integer, text, timestamptz) from public, anon;
grant execute on function public.spielstand_speichern(text, integer, jsonb, double precision, text, integer, text, timestamptz) to authenticated;
