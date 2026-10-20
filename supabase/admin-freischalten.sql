-- Admin-Zugang für dein Konto (einmalig, im Supabase SQL Editor ausführen).
-- Vorher: einmal auf playsaal.com/konto mit deiner E-Mail-Adresse anmelden, damit das Konto existiert.
-- Das Recht lässt sich NICHT über die Webseite oder die API vergeben, nur hier (privilegierter Weg).
insert into private.admins (user_id, note)
select id, 'Matthias' from auth.users where email = 'DEINE@EMAIL.DE'
on conflict (user_id) do nothing;

-- Kontrolle: muss genau eine Zeile zeigen
select a.user_id, u.email, a.note from private.admins a join auth.users u on u.id = a.user_id;

-- Zugang später entziehen:
-- delete from private.admins where user_id = (select id from auth.users where email = 'DEINE@EMAIL.DE');
