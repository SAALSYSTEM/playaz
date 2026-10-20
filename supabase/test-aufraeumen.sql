-- Testkonten entfernen (im Supabase SQL Editor). Löscht nur Konten mit der Testadresse und deren Daten
-- (Profil, Spielstände, Favoriten folgen per ON DELETE CASCADE). Fehlermeldungen/Statistik aus Testläufen sind
-- bereits als Test markiert (is_test) und fließen nicht in die Auswertung; sie werden hier ebenfalls entfernt.
-- ADRESSE ANPASSEN: nur eigene Testadressen eintragen, nie ein Muster, das echte Nutzer treffen könnte.
delete from auth.users where email in ('test-playsaal-1@example.org', 'test-playsaal-2@example.org');
delete from private.bug_reports where is_test;
select count(*) as verbleibende_testkonten from auth.users where email like 'test-playsaal-%';
