-- ROULETTE: Spiel im Katalog + neue Kategorie „Casino“ (Rocket Reels zieht von „Arcade“ dorthin um).
-- Gefahrlos wiederholbar. Ändert keine Tabellen: Roulette nutzt dieselben Coins wie Rocket Reels (private.rocket_konten,
-- Edge Function "rocket-reels" mit der neuen Aktion "roulette"). Danach die Function neu deployen (siehe docs/ROULETTE.md).

insert into public.categories (slug, name, rank, active)
values ('casino', 'Casino', 8, true)
on conflict (slug) do update set name = excluded.name, active = true;

-- „Arcade“ hatte nur Rocket Reels: ausblenden (nicht löschen)
update public.categories set active = false where slug = 'arcade';
update public.games set categories = '{casino}' where slug = 'rocket-reels';

insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('roulette', 'Roulette', 'roulette', 'roulette.', '{casino}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;
