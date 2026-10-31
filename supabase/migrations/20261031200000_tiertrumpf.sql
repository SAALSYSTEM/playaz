-- TIERTRUMPF: Spiel im Katalog (Cloud-Spielstände, Favoriten, Kategorien). Keine Rangliste.
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('tiertrumpf', 'Tiertrumpf', 'tiertrumpf', 'tiertrumpf.', '{brettspiele,kinder}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;
