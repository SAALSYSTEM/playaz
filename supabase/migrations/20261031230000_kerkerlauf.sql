-- KERKERLAUF: Spiel im Katalog (Cloud-Spielstände, Favoriten, Kategorien). Keine Rangliste (noch).
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('kerkerlauf', 'Kerkerlauf', 'kerkerlauf', 'kerkerlauf.', '{action,geschick,abenteuer}', false, null, true)
on conflict (slug) do update set name = excluded.name, categories = excluded.categories, listed = true;
