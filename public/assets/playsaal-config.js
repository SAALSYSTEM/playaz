// PlaySaal: Einstellungen für Konten, Spielstand-Sync, Fehlermeldungen und Statistik.
// Hier steht nur Öffentliches. Der "publishable key" ist für den Browser gedacht (Schutz kommt aus Row Level Security
// und den geprüften Datenbankfunktionen). Geheimnisse (service_role, SMTP, Apple/Google-Schlüssel) gehören NIE hierher.
window.PLAYSAAL_CFG = {
  url: 'https://cphwxikfrxgejiqghlwn.supabase.co',
  key: 'sb_publishable_2w5_RlUp3-Vbj3_3agGdAg_iYnVlsQ1',

  // Kanonische Adresse. Anmeldung (OAuth-Rücksprung) ist nur dort erlaubt; localhost nur für Tests.
  siteUrl: 'https://playsaal.com',

  // Stand der Spielseiten für Fehlermeldungen (bei größeren Änderungen anheben)
  build: '2026-10-19',

  // Anmeldewege. Ein Weg erscheint nur, wenn er hier freigegeben ist UND Supabase ihn als aktiv meldet.
  //  email:  erst auf true setzen, wenn eigener SMTP-Versand (Absender + Domainprüfung) eingerichtet ist,
  //          sonst gehen Codes nur an Supabase-Teammitglieder.
  //  google/apple: erst auf true, wenn der Anbieter im Supabase-Dashboard eingerichtet und getestet ist.
  anmelden: { email: true, google: false, apple: false },

  // Fehler melden: auf jeder Spielseite (Text, Spiel, Version, grobe Technikangaben; keine Pflicht-E-Mail)
  fehlermelden: true,

  // Nutzungsstatistik (anonyme Tageswerte: Spielstarts, aktive Spielzeit, Fehler). Datenschutztext beschreibt sie.
  statistik: true,

  // Geprüfte Rangliste (SCHRÄGLAGE): erst auf true, wenn Migration und Edge Function "schraeglage-lauf" eingerichtet sind.
  rangliste: true,

  // Spiel-Kennungen: Seiten-Name -> Speicher-Kennung (identisch zu public.games.save_id)
  spiele: {
    'schraeglage': 'schraeglage', 'linke-spur': 'linkespur', 'hochstapler': 'hochstapler', 'schwindelfrei': 'schwindelfrei',
    'richtfest': 'richtfest', 'eiszeit': 'eiszeit', 'stellwerk': 'stellwerk', 'wasser-marsch': 'wassermarsch',
    'turmschicht': 'turmschicht', 'dino-leiterhelden': 'dinoleiter', 'geisterschloss': 'geisterschloss',
    'kristallrausch': 'kristallrausch', 'mysupermarkt': 'mysupermarkt', 'sprungsebi': 'sprungsebi',
    'jungle-runner': 'jungle-runner', 'zahlensturm': 'zahlensturm', 'stammvoelker': 'stammvoelker',
    'sondengaenger': 'sondengaenger', 'anbiss': 'anbiss', 'hau-die-kakerlake': 'kakerlake', 'blocksaal': 'blocksaal', 'seitenwechsel': 'seitenwechsel', 'punktlandung': 'punktlandung', 'papierpilot': 'papierpilot', 'dartfieber': 'dartfieber', 'leitungschaos': 'leitungschaos', 'ausfahrt-frei': 'ausfahrt', 'kruemel': 'kruemel', 'muehle': 'muehle', 'dame': 'dame', 'backgammon': 'backgammon', 'halma': 'halma'
  },

  // Anzeigenamen (nur für Konto-Seite und Admin; Portal nutzt seine eigenen Kacheln)
  namen: {
    'schraeglage': 'Schräglage', 'linke-spur': 'Linke Spur', 'hochstapler': 'Hochstapler', 'schwindelfrei': 'Schwindelfrei', 'richtfest': 'Richtfest',
    'eiszeit': 'Eiszeit', 'stellwerk': 'Stellwerk', 'wasser-marsch': 'Wasser Marsch!', 'turmschicht': 'Turmschicht', 'dino-leiterhelden': 'Dino-Leiterhelden',
    'geisterschloss': 'Geisterschloss', 'kristallrausch': 'Kristallrausch', 'mysupermarkt': 'MySupermarkt', 'sprungsebi': 'SprungSebi',
    'jungle-runner': 'Jungle Runner', 'zahlensturm': 'Zahlensturm', 'stammvoelker': 'Stammvölker', 'sondengaenger': 'Sondengänger',
    'anbiss': 'Anbiss', 'hau-die-kakerlake': 'Hau die Kakerlake!', 'blocksaal': 'BlockSaal', 'seitenwechsel': 'Seitenwechsel', 'punktlandung': 'Punktlandung', 'papierpilot': 'Papierpilot', 'dartfieber': 'Dartfieber', 'leitungschaos': 'Leitungschaos', 'ausfahrt-frei': 'Ausfahrt frei', 'kruemel': 'Krümel', 'muehle': 'Mühle', 'dame': 'Dame', 'backgammon': 'Backgammon', 'halma': 'Halma'
  },

  // Schlüssel-Präfixe im localStorage je Spiel (identisch zu public.games.save_prefix)
  praefixe: {
    schraeglage: 'schraeglage.', linkespur: 'linkespur.', hochstapler: 'hochstapler.', schwindelfrei: 'schwindelfrei.', richtfest: 'richtfest.',
    eiszeit: 'eiszeit.', stellwerk: 'stellwerk.', wassermarsch: 'wassermarsch.', turmschicht: 'turmschicht.', dinoleiter: 'dinoleiter.',
    geisterschloss: 'geisterschloss.', kristallrausch: 'kristallrausch.', mysupermarkt: 'mysupermarkt.', sprungsebi: 'sprungssebi.',
    'jungle-runner': 'jungle.', zahlensturm: 'zahlensturm.', stammvoelker: 'stammvoelker.', sondengaenger: 'sondengaenger.',
    anbiss: 'anbiss.', kakerlake: 'kakerlake.', blocksaal: 'blocksaal.', seitenwechsel: 'seitenwechsel.', punktlandung: 'punktlandung.', papierpilot: 'papierpilot.', dartfieber: 'dartfieber.', leitungschaos: 'leitungschaos.', ausfahrt: 'ausfahrt.', kruemel: 'kruemel.', muehle: 'muehle.', dame: 'dame.', backgammon: 'backgammon.', halma: 'halma.'
  },

  // Kategorien (Grundstand, identisch zur Datenbank; die Datenbank überschreibt, solange sie erreichbar ist)
  kategorien: [
    ['geschick', 'Geschicklichkeit'], ['raetsel', 'Rätsel'], ['brettspiele', 'Brettspiele'], ['aufbau', 'Aufbau'], ['rennen', 'Rennen'],
    ['action', 'Action'], ['abenteuer', 'Abenteuer'], ['kinder', 'Für Kinder']
  ]
};
