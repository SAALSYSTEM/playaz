-- NEON COAST – STERNENFAHRT: Spiel im Katalog (Cloud-Spielstände, Favoriten, Kategorien). Keine Rangliste.
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('sternenfahrt', 'Neon Coast – Sternenfahrt', 'sternenfahrt', 'sternenfahrt.', '{rennen,kinder}', false, null, true)
on conflict (slug) do update set listed = true, categories = excluded.categories;
