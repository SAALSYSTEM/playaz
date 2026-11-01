-- TEXAS HOLD'EM: Spiel im Katalog (Kategorie „Casino“, gibt es seit der Roulette-Migration). Gefahrlos wiederholbar.
-- Keine neuen Tabellen: Poker nutzt dieselben Coins wie Rocket Reels und Roulette (private.rocket_konten,
-- Edge Function "rocket-reels" mit der Aktion "poker"). Danach die Function neu deployen (siehe docs/TEXAS_HOLDEM.md).

insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('texas-holdem', 'Texas Hold''em', 'holdem', 'holdem.', '{casino}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;
