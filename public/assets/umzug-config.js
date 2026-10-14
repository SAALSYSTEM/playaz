// Spielstand-Umzug PlayAZ -> PlaySaal. Einzige Stelle mit den beteiligten Adressen.
// ziel:    neue Hauptadresse (empfängt Spielstände)
// quellen: alte Adressen, von denen Spielstände geholt werden dürfen (exakte Origins, kein Wildcard)
// aktiv:   false = Umzug-Hinweise auf der Startseite ausgeblendet. Erst beim Domain-Cutover (Phase B) auf true setzen.
window.PLAYSAAL_UMZUG = {
  ziel: 'https://playsaal.com',
  quellen: ['https://playaz.cf-922.workers.dev'],
  aktiv: true
};
