-- HALMA: Spiel im Katalog (Cloud-Spielstände, Favoriten, Kategorien). Keine Rangliste. Kategorie „Brettspiele“ gibt es seit Mühle.
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('halma', 'Halma', 'halma', 'halma.', '{brettspiele}', false, null, true)
on conflict (slug) do update set listed = true, categories = excluded.categories;
