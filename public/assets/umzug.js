/* Spielstand-Umzug zwischen zwei Adressen (Origins).
   localStorage ist an die Adresse gebunden. Diese Seite holt Spielstände von der alten Adresse
   in einem vom Nutzer geöffneten Fenster per postMessage (strikte Origin-Prüfung) oder per Datei.
   Übertragen werden nur Schlüssel der bekannten Spiele, keine sonstigen Browserdaten. */
(function () {
  'use strict';
  const CFG = window.PLAYSAAL_UMZUG || {};
  const ZIEL = CFG.ziel || '';
  const QUELLEN = Array.isArray(CFG.quellen) ? CFG.quellen : [];
  const TYP = 'playsaal-umzug';
  const VERSION = 1;
  const MAX_WERT = 1000000;    // Zeichen je Schlüssel
  const MAX_GESAMT = 4000000;  // Zeichen je Paket
  const META_BACKUP = 'playsaal.umzug.backup';
  const META_EMPFANGEN = 'playsaal.umzug.empfangen';
  const META_GESENDET = 'playsaal.umzug.gesendet';

  const J = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };
  const zahl = (v) => Math.floor(Number(v) || 0).toLocaleString('de-DE');

  // Bekannte Spiele: Präfix bestimmt, welche Schlüssel übertragen werden dürfen.
  // "haupt" = Schlüssel, die echten Fortschritt enthalten (Ton an/aus zählt nicht als Spielstand).
  // Neues Spiel mit eigenem Präfix? Hier eintragen, sonst wird es nicht mit umgezogen.
  const SPIELE = [
    { id: 'geisterschloss', name: 'Geisterschloss', prefix: 'geisterschloss.', haupt: ['geisterschloss.v1'],
      info: (g) => { const d = J(g['geisterschloss.v1']) || {}; return { text: zahl(d.unlocked || 1) + '/20 Level · ' + zahl((d.best || []).reduce((a,b) => a + (Number(b) || 0), 0)) + ' Punkte', wert: (d.unlocked || 1) * 1000 }; } },
    { id: 'kristallrausch', name: 'Kristallrausch', prefix: 'kristallrausch.', haupt: ['kristallrausch.v1'],
      info: (g) => { const d = J(g['kristallrausch.v1']) || {}; const lv = Object.keys(d.levels || {}).length; return { text: lv + ' von 20 Höhlen · ' + zahl(d.best) + ' Punkte', wert: lv * 10000 + (d.best || 0) }; } },
    { id: 'mysupermarkt', name: 'MySupermarkt', prefix: 'mysupermarkt.', haupt: ['mysupermarkt.v1'],
      info: (g) => { const d = J(g['mysupermarkt.v1']) || {}; return { text: zahl(d.stats && d.stats.customers) + ' Kunden · ' + zahl(d.milestone) + '/20 Meilensteine', wert: (d.milestone || 0) * 10000 + ((d.stats && d.stats.customers) || 0) }; } },
    { id: 'zahlensturm', name: 'Zahlensturm', prefix: 'zahlensturm.', haupt: ['zahlensturm.v1'],
      info: (g) => { const d = J(g['zahlensturm.v1']) || {}; const lv = Object.values(d.levels || {}).filter((l) => l && l.done); const st = lv.reduce((a, l) => a + (l.stars || 0), 0); return { text: lv.length + ' von 20 Level · ' + st + ' Sterne', wert: lv.length * 100 + st * 10 + Object.keys(d.awards || {}).length }; } },
    { id: 'jungle-runner', name: 'Jungle Runner', prefix: 'jungle.', haupt: ['jungle.v1'],
      info: (g) => { const d = J(g['jungle.v1']) || {}; const lv = Object.values(d.levels || {}).filter((l) => l && l.done); const st = lv.reduce((a, l) => a + (l.stars || 0), 0); const eb = (d.endless && d.endless.best) || 0; return { text: lv.length + ' von 30 Level · ' + st + ' Sterne' + (eb ? ' · Endlos ' + zahl(eb) + ' m' : ''), wert: lv.length * 100 + st * 10 + Object.keys(d.awards || {}).length + eb / 100 }; } },
    { id: 'schraeglage', name: 'Schräglage', prefix: 'schraeglage.', haupt: ['schraeglage.v1'],
      info: (g) => { const d = J(g['schraeglage.v1']) || {}; const lv = Object.values(d.levels || {}).filter((l) => l && l.done); const gold = lv.filter((l) => l.gold).length; return { text: lv.length + ' von 35 Level · ' + gold + ' Gold', wert: lv.length * 100 + gold * 10 + Object.keys(d.awards || {}).length }; } },
    { id: 'sondengaenger', name: 'Sondengänger', prefix: 'sondengaenger.', haupt: ['sondengaenger.v1'],
      info: (g) => { const d = J(g['sondengaenger.v1']) || {}; const st = d.stats || {}; const serie = (d.daily && d.daily.streak) || 0; return { text: zahl(st.finds) + ' Funde · Stufe ' + zahl(d.lvl || 1) + (serie > 1 ? ' · Serie ' + zahl(serie) : ''), wert: (d.xp || 0) + (st.finds || 0) * 10 }; } },
    { id: 'stammvoelker', name: 'Stammvölker', prefix: 'stammvoelker.', haupt: ['stammvoelker.v1'],
      info: (g) => { const d = J(g['stammvoelker.v1']) || {}; const h = Array.isArray(d.b) ? d.b.length : 0; return { text: zahl(d.pop || 12) + ' Einwohner · ' + h + (h === 1 ? ' Hütte' : ' Hütten'), wert: (d.pop || 0) * 10 + h * 20 + (d.wood || 0) / 100 }; } },
    { id: 'anbiss', name: 'Anbiss', prefix: 'anbiss.', haupt: ['anbiss.v1'],
      info: (g) => { const d = J(g['anbiss.v1']) || {}; const st = d.stats || {}; return { text: zahl(st.caught) + ' Fische · Level ' + zahl(d.lvl || 1) + ' · ' + zahl(d.money) + ' €', wert: (d.xp || 0) + (st.caught || 0) }; } },
    { id: 'kakerlake', name: 'Hau die Kakerlake!', prefix: 'kakerlake.', haupt: ['kakerlake.v1'],
      info: (g) => { const d = J(g['kakerlake.v1']) || {}; const st = Object.values(d.stars || {}).reduce((a, b) => a + (Number(b) || 0), 0); const lv = Object.keys(d.stars || {}).length; return { text: lv + ' von 35 Level · ' + st + ' ★', wert: st * 1000 + lv * 100 + ((d.endless && d.endless.score) || 0) / 1000 }; } },
    { id: 'blocksaal', name: 'BlockSaal', prefix: 'blocksaal.', haupt: ['blocksaal.v1'],
      info: (g) => { const d = J(g['blocksaal.v1']) || {}; return { text: zahl(d.lines) + ' Reihen · ' + zahl(d.score) + ' Punkte', wert: Number(d.score) || 0 }; } },
    { id: 'turmschicht', name: 'Turmschicht', prefix: 'turmschicht.', haupt: ['turmschicht.v1'],
      info: (g) => { const d = J(g['turmschicht.v1']) || {}; const lv = Object.keys(d.best || {}).length; return { text: lv + ' von 30 Level', wert: lv * 100 + (d.unlocked || 0) }; } },
    { id: 'dinoleiter', name: 'Dino-Leiterhelden', prefix: 'dinoleiter.', haupt: ['dinoleiter.v1'],
      info: (g) => { const d = J(g['dinoleiter.v1']) || {}; const lv = Object.keys(d.best || {}).length; return { text: lv + ' von 30 Level', wert: lv * 100 + (d.unlocked || 0) }; } },
    { id: 'sprungsebi', name: 'SprungSebi', prefix: 'sprungssebi.', haupt: ['sprungssebi.v1'],
      info: (g) => { const d = J(g['sprungssebi.v1']) || {}; const lv = Object.values(d.levels || {}).filter((x) => x && x.time).length; const st = Object.values(d.levels || {}).reduce((a, x) => a + ((x && x.stars) || 0), 0); return { text: lv + ' von 35 Level · ' + st + ' Sterne', wert: lv * 1000 + st * 10 }; } },
    { id: 'stellwerk', name: 'Stellwerk', prefix: 'stellwerk.', haupt: ['stellwerk.v1'],
      info: (g) => { const d = J(g['stellwerk.v1']) || {}; const sterne = Object.values(d.stars || {}).reduce((a, b) => a + (Number(b) || 0), 0); const zuege = Object.values(d.best || {}).reduce((a, b) => a + ((b && b.n) || 0), 0); return { text: sterne + ' ★ · ' + zahl(zuege) + ' Züge in Rekorden', wert: sterne * 1000 + zuege }; } },
    { id: 'eiszeit', name: 'Eiszeit', prefix: 'eiszeit.', haupt: ['eiszeit.v1', 'eiszeit.best'],
      info: (g) => { const d = J(g['eiszeit.v1']) || {}; return { text: zahl(d.sold) + ' Eis verkauft · ' + zahl(d.coins) + ' Münzen', wert: (d.sold || 0) + (d.paid || 0) }; } },
    { id: 'linkespur', name: 'Linke Spur', prefix: 'linkespur.', haupt: ['linkespur.v1'],
      info: (g) => { const d = J(g['linkespur.v1']) || {}; const autos = Array.isArray(d.owned) ? d.owned.length : 1; return { text: 'Rekord ' + zahl(d.best) + ' · ' + zahl(d.coins) + ' Münzen · ' + autos + (autos === 1 ? ' Auto' : ' Autos'), wert: (d.runs || 0) + autos * 100 + (d.best || 0) / 1e6 }; } },
    { id: 'schwindelfrei', name: 'Schwindelfrei', prefix: 'schwindelfrei.', haupt: ['schwindelfrei.best'],
      info: (g) => { const b = Number(J(g['schwindelfrei.best'])) || 0; return { text: 'Rekord ' + zahl(b), wert: b }; } },
    { id: 'hochstapler', name: 'Hochstapler', prefix: 'hochstapler.', haupt: ['hochstapler.best', 'hochstapler.bestFloors'],
      info: (g) => { const b = Number(J(g['hochstapler.best'])) || 0; return { text: 'Rekord ' + zahl(b), wert: b }; } },
    { id: 'richtfest', name: 'Richtfest', prefix: 'richtfest.', haupt: ['richtfest.save.v1'],
      info: (g) => { const d = J(g['richtfest.save.v1']) || {}; const c = Array.isArray(d.caught) ? d.caught.length : Object.keys(d.caught || {}).filter((k) => d.caught[k]).length; return { text: c + ' von 6 Baumonstern', wert: c * 100 + (Array.isArray(d.team) ? d.team.length : 0) }; } }
  ];
  const KEY_RE = /^[a-z]+\.[A-Za-z0-9.]{1,40}$/;
  const spielFuer = (k) => SPIELE.find((s) => k.startsWith(s.prefix));
  const erlaubt = (k) => typeof k === 'string' && KEY_RE.test(k) && !!spielFuer(k);

  // ---------- localStorage (kann im Privatmodus fehlen oder werfen) ----------
  const ls = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { window.localStorage.setItem(k, v); },              // wirft absichtlich weiter
    del(k) { window.localStorage.removeItem(k); },
    keys() { const out = []; try { const s = window.localStorage; for (let i = 0; i < s.length; i++) out.push(s.key(i)); } catch (e) {} return out; }
  };

  function sammeln() {
    const d = {};
    for (const k of ls.keys()) if (erlaubt(k)) { const v = ls.get(k); if (v !== null) d[k] = v; }
    return d;
  }
  function paket() {
    return { typ: TYP, version: VERSION, quelle: location.origin, erstellt: new Date().toISOString(), daten: sammeln() };
  }
  // Prüft ein empfangenes Paket. Gibt nur erlaubte, gültige JSON-Werte zurück.
  function pruefen(p) {
    const fehler = (f) => ({ ok: false, fehler: f });
    if (!p || typeof p !== 'object' || p.typ !== TYP) return fehler('Das ist kein PlaySaal-Spielstand.');
    if (p.version !== VERSION) return fehler('Diese Spielstand-Version wird nicht unterstützt.');
    if (!p.daten || typeof p.daten !== 'object' || Array.isArray(p.daten)) return fehler('Keine Spielstände im Paket.');
    const daten = {}; let summe = 0, verworfen = 0;
    for (const k of Object.keys(p.daten)) {
      const v = p.daten[k];
      if (!erlaubt(k) || typeof v !== 'string' || v.length > MAX_WERT || J(v) === null && v !== 'null') { verworfen++; continue; }
      summe += v.length;
      if (summe > MAX_GESAMT) return fehler('Das Paket ist zu groß.');
      daten[k] = v;
    }
    return { ok: true, daten, verworfen };
  }
  const gruppe = (daten, s) => { const g = {}; for (const k in daten) if (k.startsWith(s.prefix)) g[k] = daten[k]; return g; };
  function stand(daten, s) {
    const g = gruppe(daten, s);
    if (!s.haupt.some((k) => k in g)) return { hat: false, text: '–', wert: 0 };
    try { const i = s.info(g); return { hat: true, text: i.text, wert: Number(i.wert) || 0 }; }
    catch (e) { return { hat: true, text: 'Spielstand vorhanden', wert: 0 }; }
  }
  // Vergleich alt (Paket) gegen hier. Vorschlag: übernehmen, wenn hier nichts liegt oder alt mehr Fortschritt hat.
  function vergleichen(daten) {
    const hier = sammeln();
    return SPIELE.map((s) => {
      const a = stand(daten, s), h = stand(hier, s);
      const vorschlag = !a.hat ? 'hier' : !h.hat ? 'alt' : (a.wert > h.wert ? 'alt' : 'hier');
      return { spiel: s, alt: a, hier: h, vorschlag };
    });
  }
  // Schreibt die gewählten Spiele. Vorher Sicherung; bei Fehler alles zurück.
  function anwenden(daten, auswahl, herkunft) {
    const sicherung = { at: new Date().toISOString(), herkunft, werte: {} };
    const schreiben = [];
    for (const s of SPIELE) {
      if (auswahl[s.id] !== 'alt') continue;
      const g = gruppe(daten, s);
      for (const k in g) { sicherung.werte[k] = ls.get(k); schreiben.push([k, g[k]]); }
    }
    if (!schreiben.length) return { ok: true, anzahl: 0 };
    try { ls.set(META_BACKUP, JSON.stringify(sicherung)); }
    catch (e) { return { ok: false, fehler: 'Der Browser lässt hier nichts speichern (Privatmodus oder Speicher voll). Es wurde nichts verändert.' }; }
    try {
      for (const [k, v] of schreiben) ls.set(k, v);
      ls.set(META_EMPFANGEN, JSON.stringify({ at: sicherung.at, herkunft, spiele: SPIELE.filter((s) => auswahl[s.id] === 'alt').map((s) => s.id) }));
    } catch (e) {
      zurueckspielen(sicherung);
      return { ok: false, fehler: 'Speichern fehlgeschlagen (Speicher voll?). Der vorherige Stand wurde wiederhergestellt.' };
    }
    return { ok: true, anzahl: schreiben.length };
  }
  function zurueckspielen(sicherung) {
    for (const k in sicherung.werte) {
      const v = sicherung.werte[k];
      if (v === null) { try { ls.del(k); } catch (e) {} continue; }
      try { ls.set(k, v); } catch (e) { try { ls.del(k); ls.set(k, v); } catch (e2) {} } // bei vollem Speicher erst freigeben
    }
  }
  function rueckgaengig() {
    const s = J(ls.get(META_BACKUP));
    if (!s || !s.werte) return false;
    zurueckspielen(s);
    try { ls.del(META_BACKUP); ls.del(META_EMPFANGEN); } catch (e) {}
    return true;
  }

  // Für Tests und die Startseite
  window.PlaySaalUmzug = { SPIELE, ZIEL, QUELLEN, erlaubt, sammeln, paket, pruefen, vergleichen, anwenden, rueckgaengig, stand, META_BACKUP, META_EMPFANGEN, META_GESENDET };

  // ---------- Oberfläche (nur auf /umzug) ----------
  const $ = (id) => document.getElementById(id);
  if (!$('umzug')) return;

  const host = (o) => o.replace(/^https?:\/\//, '');
  const status = (text, art) => { const el = $('status'); el.textContent = text; el.className = 'status' + (art ? ' ' + art : ''); el.hidden = !text; if (text) el.scrollIntoView({ block: 'nearest' }); };
  const rolle = location.origin === ZIEL ? 'ziel' : QUELLEN.includes(location.origin) ? 'quelle' : 'andere';
  document.body.dataset.rolle = rolle;

  function zeile(zellen, kopf, labels) {
    const tr = document.createElement('tr');
    zellen.forEach((z, i) => { const td = document.createElement(kopf ? 'th' : 'td'); if (labels && labels[i]) td.dataset.label = labels[i]; if (z instanceof Node) td.append(z); else td.textContent = z; tr.append(td); });
    return tr;
  }
  function lokaleTabelle() {
    const t = $('tabLokal'); t.textContent = '';
    const d = sammeln(); let n = 0;
    t.append(zeile(['Spiel', 'Spielstand in diesem Browser'], true));
    for (const s of SPIELE) { const st = stand(d, s); if (st.hat) n++; t.append(zeile([s.name, st.text])); }
    $('lokalLeer').hidden = n > 0;
    return n;
  }

  // Vergleich + Übernahme (gemeinsam für Fenster-Transfer und Datei)
  let offen = null; // { daten, herkunft, danach }
  function zeigeVergleich(daten, herkunft, danach) {
    offen = { daten, herkunft, danach };
    const v = vergleichen(daten);
    const t = $('tabVergleich'); t.textContent = '';
    const kopf = ['Spiel', herkunft, 'Hier', 'Übernehmen?'];
    t.append(zeile(kopf, true));
    let n = 0;
    for (const r of v) {
      if (!r.alt.hat) continue;
      n++;
      const sel = document.createElement('select');
      sel.name = r.spiel.id; sel.setAttribute('aria-label', r.spiel.name + ': welcher Spielstand soll gelten?');
      for (const [val, txt] of [['alt', 'Übernehmen'], ['hier', 'Hier behalten']]) { const o = document.createElement('option'); o.value = val; o.textContent = txt; sel.append(o); }
      sel.value = r.vorschlag;
      t.append(zeile([r.spiel.name, r.alt.text, r.hier.text, sel], false, kopf));
    }
    $('vergleich').hidden = false;
    $('vergleichLeer').hidden = n > 0;
    $('uebernehmen').hidden = n === 0;
    $('vergleich').scrollIntoView({ block: 'start' });
  }
  $('uebernehmen').addEventListener('click', () => {
    if (!offen) return;
    const auswahl = {};
    for (const sel of $('tabVergleich').querySelectorAll('select')) auswahl[sel.name] = sel.value;
    const r = anwenden(offen.daten, auswahl, offen.herkunft);
    if (!r.ok) { status(r.fehler, 'fehler'); return; }
    status(r.anzahl ? 'Fertig. Deine Spielstände sind jetzt hier gespeichert.' : 'Nichts übernommen. Hier hat sich nichts geändert.', 'ok');
    if (offen.danach) offen.danach();
    offen = null;
    $('vergleich').hidden = true;
    $('zurueck').hidden = !ls.get(META_BACKUP);
    lokaleTabelle();
  });
  $('rueckgaengig').addEventListener('click', () => {
    if (rueckgaengig()) { status('Rückgängig gemacht. Der Stand vor dem Umzug ist wiederhergestellt.', 'ok'); $('zurueck').hidden = true; lokaleTabelle(); }
  });

  // ---------- Empfänger: neue Adresse holt von alter Adresse ----------
  let fenster = null, erwartet = null, nonce = null;
  function zufall() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); }
  window.addEventListener('message', (e) => {
    const m = e.data;
    // Nur Nachrichten aus dem selbst geöffneten Fenster der erwarteten alten Adresse mit passender Einmal-Kennung
    if (rolle !== 'ziel' || !fenster || e.source !== fenster || e.origin !== erwartet) return;
    if (!m || m.typ !== TYP + ':paket' || m.nonce !== nonce) return;
    const p = pruefen(m.paket);
    if (!p.ok) { status(p.fehler, 'fehler'); return; }
    const quelle = erwartet, f = fenster, n = nonce;
    if (!Object.keys(p.daten).length) { status('Unter ' + host(quelle) + ' sind in diesem Browser keine Spielstände gespeichert.', 'hinweis'); try { f.postMessage({ typ: TYP + ':fertig', nonce: n, anzahl: 0 }, quelle); } catch (err) {} return; }
    status('Spielstände von ' + host(quelle) + ' empfangen. Bitte prüfen und übernehmen.', 'hinweis');
    zeigeVergleich(p.daten, host(quelle), () => { try { f.postMessage({ typ: TYP + ':fertig', nonce: n }, quelle); } catch (err) {} });
  });
  function holen(quelle) {
    nonce = zufall(); erwartet = quelle;
    fenster = window.open(quelle + '/umzug#senden=' + nonce, 'playsaal-umzug');
    if (!fenster) { status('Das Fenster wurde blockiert. Erlaube Pop-ups für diese Seite oder nutze unten die Datei.', 'fehler'); return; }
    status('Im neuen Fenster auf „Übertragen“ tippen. Danach geht es hier weiter.', 'hinweis');
  }

  // ---------- Sender: alte Adresse, von der neuen geöffnet ----------
  function senderModus() {
    const m = /^#senden=([0-9a-f]{32})$/.exec(location.hash);
    if (!m || !window.opener) return false;
    const n = m[1];
    $('senden').hidden = false;
    $('sendenZiel').textContent = host(ZIEL);
    window.addEventListener('message', (e) => {
      if (e.origin !== ZIEL || e.source !== window.opener) return;
      const d = e.data;
      if (!d || d.typ !== TYP + ':fertig' || d.nonce !== n) return;
      try { ls.set(META_GESENDET, JSON.stringify({ at: new Date().toISOString(), an: ZIEL })); } catch (err) {}
      status(d.anzahl === 0 ? 'Hier waren keine Spielstände. Du kannst dieses Fenster schließen.' : 'Übertragen. Du kannst dieses Fenster schließen.', 'ok');
      setTimeout(() => { try { window.close(); } catch (err) {} }, 1500);
    });
    $('uebertragen').addEventListener('click', () => {
      try {
        // targetOrigin = ZIEL: der Browser stellt nur zu, wenn das öffnende Fenster wirklich auf der neuen Adresse ist
        window.opener.postMessage({ typ: TYP + ':paket', nonce: n, paket: paket() }, ZIEL);
        status('Gesendet. Bitte im PlaySaal-Fenster bestätigen.', 'hinweis');
      } catch (e) { status('Übertragung nicht möglich. Nutze unten die Datei.', 'fehler'); }
    });
    return true;
  }

  // ---------- Datei / Text ----------
  function dateiname() { return 'playsaal-spielstaende-' + new Date().toISOString().slice(0, 10) + '.json'; }
  $('exportDatei').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(paket(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = dateiname();
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status('Datei gespeichert. Öffne sie auf der neuen Adresse unter „Spielstände aus Datei laden“.', 'ok');
  });
  $('exportText').addEventListener('click', async () => {
    const f = $('textFeld'); f.value = JSON.stringify(paket()); f.hidden = false; f.select();
    try { await navigator.clipboard.writeText(f.value); status('Text kopiert. Auf der neuen Adresse ins Textfeld einfügen.', 'ok'); }
    catch (e) { status('Text ist markiert. Kopieren und auf der neuen Adresse einfügen.', 'hinweis'); }
  });
  function importieren(text, herkunft) {
    const p = pruefen(J(text));
    if (!p.ok) { status(p.fehler, 'fehler'); return; }
    if (!Object.keys(p.daten).length) { status('In der Datei sind keine Spielstände.', 'hinweis'); return; }
    zeigeVergleich(p.daten, herkunft, null);
  }
  $('importDatei').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (file.size > MAX_GESAMT * 2) { status('Die Datei ist zu groß.', 'fehler'); return; }
    file.text().then((t) => importieren(t, 'Datei'), () => status('Datei konnte nicht gelesen werden.', 'fehler'));
    e.target.value = '';
  });
  $('importText').addEventListener('click', () => {
    const f = $('textFeld');
    if (f.hidden || !f.value.trim()) { f.hidden = false; f.value = ''; f.focus(); status('Text einfügen und erneut auf „Text prüfen“ tippen.', 'hinweis'); return; }
    importieren(f.value, 'Text');
  });

  // ---------- Start ----------
  lokaleTabelle();
  $('zurueck').hidden = !ls.get(META_BACKUP);
  if (rolle === 'ziel') {
    $('empfang').hidden = false;
    const box = $('quellen');
    for (const q of QUELLEN) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn';
      b.textContent = 'Spielstände von ' + host(q) + ' holen';
      b.addEventListener('click', () => holen(q));
      box.append(b);
    }
  } else if (rolle === 'quelle') {
    if (!senderModus()) {
      $('altInfo').hidden = false;
      const a = $('zumZiel'); a.href = ZIEL + '/umzug'; a.textContent = host(ZIEL);
      $('zumZielBox').hidden = !CFG.aktiv;
    }
  } else {
    $('andereInfo').hidden = false;
  }
})();
