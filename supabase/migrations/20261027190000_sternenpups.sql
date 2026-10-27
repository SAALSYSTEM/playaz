-- STERNENPUPS: Spiel im Katalog (Cloud-Spielstände, Favoriten, Kategorien). Keine Rangliste.
-- listed = false, solange das Spiel nur über die Vorschau getestet wird; zur Veröffentlichung auf true setzen.
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('sternenpups', 'Sternenpups', 'sternenpups', 'sternenpups.', '{abenteuer,kinder}', false, null, false)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories;
