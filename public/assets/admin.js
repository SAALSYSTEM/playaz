// Adminbereich. Die Zugriffsprüfung passiert in der Datenbank (admin_*-Funktionen prüfen private.admins).
// Diese Seite blendet nur Oberfläche ein oder aus; ohne Adminrecht liefern die Funktionen keinerlei Daten.
(function () {
  'use strict';
  const PS = window.PlaySaal, C = window.PLAYSAAL_CFG;
  if (!PS || !C) return;
  const $ = (id) => document.getElementById(id);
  const leeren = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
  const mk = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const meld = (text, art) => { const e = $('meldung'); e.className = 'f' + (art ? ' ' + art : ''); e.textContent = text || ''; };
  const zahl = (n) => Number(n || 0).toLocaleString('de-DE');
  const min = (s) => { s = Number(s || 0); return s >= 3600 ? (s / 3600).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Std.' : Math.round(s / 60).toLocaleString('de-DE') + ' Min.'; };
  const STATUS = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt' };
  let tage = 1, katalog = [], kategorien = [];

  async function rpc(name, args) {
    const r = await PS.rpc(name, args);
    if (r.fehler) return { fehler: r.status === 403 || r.code === '42501' ? 'zugriff' : 'netz' };
    return { daten: r.daten };
  }
  function tab(name) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === name)));
    document.querySelectorAll('[data-bereich]').forEach((s) => { s.hidden = s.dataset.bereich !== name; });
    meld('');
    if (name === 'uebersicht' || name === 'spiele') statistik();
    if (name === 'katalog') katalogLaden();
    if (name === 'fehler') fehlerLaden();
  }

  async function statistik() {
    const r = await rpc('admin_statistik', { p_tage: tage });
    if (r.fehler) { meld('Auswertung konnte nicht geladen werden.', 'e'); return; }
    const d = r.daten, s = d.summe;
    $('zeitraum').textContent = (tage === 1 ? 'Heute' : 'Zeitraum') + ': ' + d.von + (d.von !== d.bis ? ' bis ' + d.bis : '') + ' (Kalendertage in Europe/Berlin)';
    const z = $('zahlen'); leeren(z);
    [['Spielstarts', zahl(s.starts)], ['Aktive Spielzeit', min(s.spielzeit_s)], ['Fortschritte', zahl(s.abschluesse)], ['Fehlermeldungen', zahl(d.fehler)], ['Davon offen (gesamt)', zahl(d.fehler_offen)], ['Konten gesamt', zahl(d.konten)], ['Neue Konten', zahl(d.konten_neu)]].forEach(([l, v]) => { const e = mk('div', null, 'zahl'); e.append(mk('b', v), mk('span', l)); z.append(e); });
    if (!s.starts && !s.spielzeit_s) $('zeitraum').textContent += ' · Keine Daten im Zeitraum (die Erfassung ist evtl. noch ausgeschaltet).';
    const t = $('tage'); leeren(t);
    const kopf = mk('tr'); ['Tag', 'Spielstarts', 'Aktive Spielzeit'].forEach((h, i) => { const th = mk('th', h); if (i) th.className = 'z'; kopf.append(th); }); t.append(kopf);
    (d.tage || []).forEach((x) => { const tr = mk('tr'); tr.append(mk('td', x.day), Object.assign(mk('td', zahl(x.starts)), { className: 'z' }), Object.assign(mk('td', min(x.spielzeit_s)), { className: 'z' })); t.append(tr); });
    const sp = $('spieleTab'); leeren(sp);
    const k2 = mk('tr'); ['Spiel', 'Spielstarts', 'Aktive Spielzeit', 'Ø je Start', 'Fortschritte', 'Fehler'].forEach((h, i) => { const th = mk('th', h); if (i) th.className = 'z'; k2.append(th); }); sp.append(k2);
    (d.spiele || []).forEach((x) => { const tr = mk('tr'); const avg = x.starts ? min(x.spielzeit_s / x.starts) : '–'; tr.append(mk('td', x.name)); [zahl(x.starts), min(x.spielzeit_s), avg, zahl(x.abschluesse), zahl(x.fehler)].forEach((v) => tr.append(Object.assign(mk('td', v), { className: 'z' }))); sp.append(tr); });
  }

  async function katalogLaden() {
    try {
      const c = await PS.client();
      const [g, k] = await Promise.all([c.from('games').select('slug,name,categories,hot,hot_rank,listed').order('name'), c.from('categories').select('slug,name,rank,active').order('rank')]);
      if (g.error || k.error) throw new Error('x');
      katalog = g.data; kategorien = k.data;
    } catch (e) { meld('Katalog konnte nicht geladen werden.', 'e'); return; }
    const box = $('katalogListe'); leeren(box);
    katalog.forEach((s) => {
      const row = mk('div', null, 'fehler'); const kopf = mk('div', null, 'zeile'); kopf.append(mk('b', s.name), mk('small', s.slug));
      const chips = mk('div', null, 'chips'); const cbs = {};
      kategorien.forEach((kat) => { const l = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = s.categories.includes(kat.slug); cbs[kat.slug] = cb; l.append(cb, document.createTextNode(kat.name)); chips.append(l); });
      const opt = mk('div', null, 'chips');
      const hot = document.createElement('input'); hot.type = 'checkbox'; hot.checked = s.hot; const lh = document.createElement('label'); lh.append(hot, document.createTextNode('Hot'));
      const rang = document.createElement('input'); rang.type = 'text'; rang.inputMode = 'numeric'; rang.value = s.hot_rank == null ? '' : String(s.hot_rank); rang.style.cssText = 'width:64px;min-height:34px'; rang.setAttribute('aria-label', 'Rang in Hot für ' + s.name); const lr = document.createElement('label'); lr.append(document.createTextNode('Rang'), rang);
      const gel = document.createElement('input'); gel.type = 'checkbox'; gel.checked = s.listed; const lg = document.createElement('label'); lg.append(gel, document.createTextNode('Gelistet'));
      const sp = mk('button', 'Speichern', 'btn klein ja'); sp.type = 'button';
      opt.append(lh, lr, lg, sp);
      sp.addEventListener('click', async () => {
        sp.disabled = true;
        const r = await rpc('admin_spiel_speichern', { p_slug: s.slug, p_categories: Object.keys(cbs).filter((x) => cbs[x].checked), p_hot: hot.checked, p_hot_rank: rang.value ? Number(rang.value) : null, p_listed: gel.checked });
        sp.disabled = false; meld(r.daten && r.daten.ok ? s.name + ' gespeichert.' : 'Speichern fehlgeschlagen.', r.daten && r.daten.ok ? 'g' : 'e');
      });
      row.append(kopf, chips, opt); box.append(row);
    });
    const kl = $('katListe'); leeren(kl);
    kategorien.forEach((kat) => {
      const z = mk('div', null, 'zeile'); const name = document.createElement('input'); name.type = 'text'; name.value = kat.name; name.maxLength = 40; name.setAttribute('aria-label', 'Name ' + kat.slug); name.style.maxWidth = '220px';
      const rang = document.createElement('input'); rang.type = 'text'; rang.value = String(kat.rank); rang.style.cssText = 'width:64px'; rang.setAttribute('aria-label', 'Rang ' + kat.slug);
      const akt = document.createElement('input'); akt.type = 'checkbox'; akt.checked = kat.active; const la = document.createElement('label'); la.append(akt, document.createTextNode(' aktiv'));
      const b = mk('button', 'Speichern', 'btn klein'); b.type = 'button';
      b.addEventListener('click', async () => { const r = await rpc('admin_kategorie_speichern', { p_slug: kat.slug, p_name: name.value, p_rank: Number(rang.value) || 0, p_active: akt.checked }); meld(r.daten && r.daten.ok ? 'Kategorie gespeichert.' : 'Speichern fehlgeschlagen.', r.daten && r.daten.ok ? 'g' : 'e'); });
      z.append(mk('small', kat.slug), name, rang, la, b); kl.append(z);
    });
  }
  $('katNeu').addEventListener('click', async () => {
    const slug = $('katSlug').value.trim(), name = $('katName').value.trim();
    if (!/^[a-z0-9-]{2,30}$/.test(slug) || name.length < 2) { meld('Kennung: 2–30 Zeichen (a–z, 0–9, -). Name: mindestens 2 Zeichen.', 'e'); return; }
    const r = await rpc('admin_kategorie_speichern', { p_slug: slug, p_name: name, p_rank: 50, p_active: true });
    if (r.daten && r.daten.ok) { $('katSlug').value = ''; $('katName').value = ''; meld('Kategorie angelegt.', 'g'); katalogLaden(); } else meld('Anlegen fehlgeschlagen.', 'e');
  });

  async function fehlerLaden() {
    const f = $('fehlerFilter').value || null;
    const r = await rpc('admin_fehler', { p_status: f });
    if (r.fehler) { meld('Fehlermeldungen konnten nicht geladen werden.', 'e'); return; }
    const box = $('fehlerListe'); leeren(box);
    const liste = r.daten || [];
    $('fehlerZahl').textContent = '';
    if (!liste.length) { box.append(mk('p', 'Keine Meldungen.', 'klein')); return; }
    liste.forEach((x) => {
      const row = mk('div', null, 'fehler');
      const kopf = mk('div', null, 'zeile'); const l = mk('div'); l.append(mk('b', x.spielname));
      if (x.test) l.append(document.createTextNode(' '), mk('span', 'TEST', 'test'));
      l.append(document.createElement('br'), mk('small', new Date(x.erstellt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + (x.version ? ' · Version ' + x.version : '')));
      const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Status');
      Object.entries(STATUS).forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === x.status) o.selected = true; sel.append(o); });
      sel.addEventListener('change', async () => { const rr = await rpc('admin_fehler_status', { p_id: x.id, p_status: sel.value }); meld(rr.daten && rr.daten.ok ? 'Status gespeichert.' : 'Status konnte nicht gespeichert werden.', rr.daten && rr.daten.ok ? 'g' : 'e'); });
      kopf.append(l, sel);
      row.append(kopf, mk('p', x.text));
      const t = x.technik || {}; const teile = [t.ansicht && 'Ansicht ' + t.ansicht, t.touch === true ? 'Touch' : t.touch === false ? 'kein Touch' : '', t.browser].filter(Boolean);
      if (teile.length) row.append(mk('small', teile.join(' · ')));
      box.append(row);
    });
  }

  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
  document.querySelectorAll('[data-tage]').forEach((b) => b.addEventListener('click', () => { tage = Number(b.dataset.tage); document.querySelectorAll('[data-tage]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); statistik(); }));
  $('fehlerFilter').addEventListener('change', fehlerLaden);
  $('anmelden').addEventListener('click', () => PS.anmelden());
  $('abmelden').addEventListener('click', async () => { await PS.abmelden({ erzwingen: true }); location.reload(); });

  async function pruefen() {
    $('laden').hidden = true; ['login', 'keinZugriff', 'inhalt'].forEach((id) => { $(id).hidden = true; });
    if (!PS.user()) { $('login').hidden = false; PS.anbieter().then((a) => { $('anmelden').hidden = !(a.email || a.google || a.apple); }); return; }
    const r = await rpc('ist_admin', {});
    if (r.daten === true) { $('inhalt').hidden = false; tab('uebersicht'); } else $('keinZugriff').hidden = false;
  }
  PS.on('auth', pruefen);
  PS.on('bereit', pruefen);
  if (PS.bereit()) pruefen();
})();
