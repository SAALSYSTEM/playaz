-- MÜHLE: neue Kategorie „Brettspiele“ und das Spiel im Katalog (Cloud-Spielstände, Favoriten, Kategorien). Keine Rangliste.
-- Erst beim Veröffentlichen ausführen: Die Kategorie erscheint sofort auf der Startseite.
insert into public.categories (slug, name, rank, active)
values ('brettspiele', 'Brettspiele', 3)
on conflict (slug) do update set name = excluded.name, active = true;

insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('muehle', 'Mühle', 'muehle', 'muehle.', '{brettspiele,raetsel}', false, null, true)
on conflict (slug) do update set listed = true, categories = excluded.categories;
