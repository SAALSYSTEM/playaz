-- SCHATTENSCHRITT: Spiel im Katalog (Cloud-Spielstände, Favoriten, Kategorien). Keine Rangliste (Rätsel mit fester Lösung).
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('schattenschritt', 'Schattenschritt', 'schattenschritt', 'schattenschritt.', '{raetsel,abenteuer}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;
