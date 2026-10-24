-- KRÜMEL – Die große Käsejagd: Spiel im Katalog (für Cloud-Spielstände, Favoriten und Kategorien). Keine Rangliste.
insert into public.games (slug, name, save_id, save_prefix, categories, hot, hot_rank, listed)
values ('kruemel', 'Krümel', 'kruemel', 'kruemel.', '{geschick,abenteuer,kinder}', false, null, true)
on conflict (slug) do update set listed = true;
