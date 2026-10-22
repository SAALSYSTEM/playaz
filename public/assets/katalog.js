// Startseite: Kategorien, Hot-Auswahl und Favoriten.
// Grundstand steht fest im HTML (data-kategorien je Kachel). Die Datenbank überschreibt ihn nur, solange sie erreichbar ist;
// fällt Supabase aus, bleibt die Seite vollständig und bedienbar (zuletzt geladener Stand wird aus dem Browser-Speicher genommen).
(function () {
  'use strict';
  const C = window.PLAYSAAL_CFG;
  if (!C) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const SLUG = /^[a-z0-9-]{2,40}$/;
  const hotUl = $('#hot .kacheln'), neuUl = $('#neu .kacheln');
  if (!hotUl || !neuUl) return;
  const BASIS_HOT = hotUl.children.length;
  const registry = new Map();
  $$('.kachel').forEach((li) => { if (!registry.has(li.dataset.slug)) registry.set(li.dataset.slug, li); });

  const NEU_TAGE = 30;   // „Neu“ zeigt ein Spiel höchstens so lange (Datum: games.added_on)
  const alleSec = document.createElement('section'); alleSec.className = 'block block-alle'; alleSec.id = 'alle'; alleSec.setAttribute('aria-labelledby', 'alle-titel'); alleSec.hidden = true;
  const alleKopf = document.createElement('div'); alleKopf.className = 'block-kopf';
  const alleH = document.createElement('h2'); alleH.id = 'alle-titel'; alleH.textContent = 'Alle Spiele';
  const alleP = document.createElement('p'); alleP.textContent = 'Von A bis Z';
  alleKopf.append(alleH, alleP);
  const alleUl = document.createElement('ul'); alleUl.className = 'kacheln'; alleUl.dataset.lay = 'filter';
  alleSec.append(alleKopf, alleUl);
  $('#neu').after(alleSec);
  const ueber = new Map();   // Stand aus der Datenbank je Spiel (Kategorien, gelistet)
  function alleBauen() {
    const li = Array.from(registry.values()).sort((a, b) => (a.dataset.name || a.dataset.slug).localeCompare(b.dataset.name || b.dataset.slug, 'de')).map((q) => {
      const c = q.cloneNode(true), u = ueber.get(q.dataset.slug);
      $$('.fav', c).forEach((b) => b.remove()); c.hidden = false;
      if (u) { c.dataset.kategorien = u.categories.join(','); c.dataset.gelistet = u.listed ? '1' : '0'; }
      return c;
    });
    alleUl.replaceChildren.apply(alleUl, li);
  }

  let kats = C.kategorien.map((k) => ({ slug: k[0], name: k[1], active: true }));
  window.__katNamen = Object.fromEntries(kats.map((k) => [k.slug, k.name]));
  let auswahl = 'alle';
  let herzenAn = false;

  // ---------------------------------------------------------------- Katalog anwenden
  function pruefen(d) {
    if (!d || !Array.isArray(d.games) || !Array.isArray(d.categories) || d.games.length > 200 || d.categories.length > 50) return null;
    const games = d.games.filter((g) => g && SLUG.test(String(g.slug)) && Array.isArray(g.categories) && g.categories.every((c) => SLUG.test(String(c))) && typeof g.hot === 'boolean' && typeof g.listed === 'boolean')
      .map((g) => ({ slug: g.slug, categories: g.categories.slice(0, 8), hot: g.hot, rank: Number.isFinite(g.hot_rank) ? g.hot_rank : 99, listed: g.listed, added: /^\d{4}-\d\d-\d\d$/.test(String(g.added_on)) ? g.added_on : null }));
    const categories = d.categories.filter((c) => c && SLUG.test(String(c.slug)) && typeof c.name === 'string' && c.name.length >= 2 && c.name.length <= 40)
      .map((c) => ({ slug: c.slug, name: c.name, rank: Number(c.rank) || 0, active: c.active !== false }));
    return games.length ? { games, categories } : null;
  }
  function anwenden(d) {
    d.categories.sort((a, b) => a.rank - b.rank);
    if (d.categories.length) { kats = d.categories.filter((c) => c.active); window.__katNamen = Object.fromEntries(d.categories.map((k) => [k.slug, k.name])); }
    d.games.forEach((g) => $$('.kachel[data-slug="' + g.slug + '"]').forEach((li) => { li.dataset.kategorien = g.categories.join(','); li.dataset.gelistet = g.listed ? '1' : '0'; }));
    // Hot-Block: Mitglieder und Reihenfolge aus der Datenbank
    const wunsch = d.games.filter((g) => g.hot && g.listed && registry.has(g.slug)).sort((a, b) => a.rank - b.rank).map((g) => g.slug);
    if (wunsch.length) {
      const vorhanden = new Map($$('.kachel', hotUl).map((li) => [li.dataset.slug, li]));
      const neu = wunsch.map((s) => { const li = vorhanden.get(s) || registry.get(s).cloneNode(true); li.dataset.gelistet = '1'; $$('.fav', li).forEach((b) => b.remove()); return li; });
      hotUl.replaceChildren.apply(hotUl, neu);
      hotUl.dataset.lay = neu.length === BASIS_HOT && auswahl === 'alle' ? 'hot' : 'filter';
    }
    // Neu: nur Spiele, die höchstens NEU_TAGE Tage alt sind, neueste zuerst
    d.games.forEach((g) => {
      ueber.set(g.slug, g);
      if (!g.added) return;
      const alter = (Date.now() - Date.parse(g.added)) / 864e5;
      $$('.kachel[data-slug="' + g.slug + '"]', neuUl).forEach((li) => { if (alter > NEU_TAGE) li.remove(); else li.dataset.neuab = g.added; });
    });
    neuUl.append.apply(neuUl, $$('.kachel', neuUl).sort((a, b) => (b.dataset.neuab || '').localeCompare(a.dataset.neuab || '')));
    alleBauen();
    d.games.forEach((g) => { if (!g.listed) $$('.kachel[data-slug="' + g.slug + '"]').forEach((li) => { li.hidden = true; }); });
    herzen(); chips(); filtern();
  }

  // ---------------------------------------------------------------- Kategorie-Leiste
  const leiste = document.createElement('nav'); leiste.className = 'wrap kat'; leiste.id = 'kategorien'; leiste.setAttribute('aria-label', 'Kategorien');
  const leer = document.createElement('div'); leer.className = 'wrap kat-leer'; leer.id = 'katLeer'; leer.setAttribute('role', 'status'); leer.hidden = true;
  const spiele = $('#spiele');
  spiele.parentNode.insertBefore(leiste, spiele); spiele.parentNode.insertBefore(leer, spiele);
  function chips() {
    leiste.textContent = '';
    const liste = document.createElement('div'); liste.className = 'kat-chips'; liste.setAttribute('role', 'group');
    const eintraege = [['alle', 'Alle']];
    if (window.PlaySaal && window.PlaySaal.user()) eintraege.push(['fav', '♥ Favoriten']);
    kats.forEach((k) => eintraege.push([k.slug, k.name]));
    eintraege.forEach(([slug, name]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.kat = slug; b.setAttribute('aria-pressed', String(auswahl === slug));
      b.addEventListener('click', () => { auswahl = auswahl === slug && slug !== 'alle' ? 'alle' : slug; chips(); filtern(); });
      liste.append(b);
    });
    leiste.append(liste);
  }
  function filtern() {
    const favs = window.PlaySaal ? window.PlaySaal.favoriten() : new Set();
    const gesehen = new Set(); let sichtbar = 0;
    const filtert = auswahl !== 'alle';
    [hotUl, neuUl, alleUl].forEach((ul) => {
      let n = 0;
      $$('.kachel', ul).forEach((li) => {
        const ok = li.dataset.gelistet !== '0' && (!filtert || (auswahl === 'fav' ? favs.has(li.dataset.slug) : (li.dataset.kategorien || '').split(',').includes(auswahl)));
        const doppelt = filtert && gesehen.has(li.dataset.slug);
        li.hidden = !ok || doppelt;
        if (!li.hidden) { n++; gesehen.add(li.dataset.slug); }
      });
      ul.closest('.block').hidden = n === 0;
      ul.dataset.lay = filtert || ul === alleUl ? 'filter' : (ul === hotUl ? (hotUl.children.length === BASIS_HOT ? 'hot' : 'filter') : 'neu');
      sichtbar += n;
    });
    leer.hidden = sichtbar > 0;
    if (!sichtbar) {
      leer.textContent = '';
      const t = document.createElement('p');
      t.textContent = auswahl === 'fav' ? 'Du hast noch keine Favoriten. Tippe bei einem Spiel auf das Herz.' : 'In dieser Kategorie gibt es noch kein Spiel.';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kat-alle'; b.textContent = 'Alle Spiele anzeigen';
      b.addEventListener('click', () => { auswahl = 'alle'; chips(); filtern(); });
      leer.append(t, b);
    }
  }

  // ---------------------------------------------------------------- Favoriten-Herzen
  const HERZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.600-9 9-9 9z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function herzen() {
    const PS = window.PlaySaal; if (!herzenAn || !PS) return;
    $$('.kachel').forEach((li) => {
      let b = $('.fav', li);
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.className = 'fav'; b.innerHTML = HERZ;
        b.addEventListener('click', async (e) => {
          e.preventDefault(); e.stopPropagation();
          if (!PS.user()) { PS.anmelden(); return; }
          const an = !PS.favoriten().has(li.dataset.slug); b.disabled = true;
          const r = await PS.favorit(li.dataset.slug, an); b.disabled = false;
          if (r.fehler) b.title = 'Speichern nicht möglich';
        });
        li.append(b);
      }
      const name = li.dataset.name || li.dataset.slug, fav = PS.favoriten().has(li.dataset.slug);
      b.setAttribute('aria-pressed', String(fav)); b.setAttribute('aria-label', fav ? name + ' aus Favoriten entfernen' : name + ' zu Favoriten hinzufügen'); b.title = fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
    });
  }

  // ---------------------------------------------------------------- Laden (mit Zwischenspeicher und Zeitlimit)
  async function laden() {
    const roh = (() => { try { return JSON.parse(localStorage.getItem('playsaal.katalog')); } catch (e) { return null; } })();
    const alt = roh && pruefen(roh.d); if (alt) anwenden(alt);
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const h = { apikey: C.key };
      const [g, k] = await Promise.all([
        fetch(C.url + '/rest/v1/games?select=slug,categories,hot,hot_rank,listed,added_on', { headers: h, signal: ctl.signal }).then((r) => r.ok ? r.json() : Promise.reject(new Error('games'))),
        fetch(C.url + '/rest/v1/categories?select=slug,name,rank,active', { headers: h, signal: ctl.signal }).then((r) => r.ok ? r.json() : Promise.reject(new Error('categories')))
      ]);
      clearTimeout(t);
      const neu = pruefen({ games: g, categories: k });
      if (neu) { try { localStorage.setItem('playsaal.katalog', JSON.stringify({ t: Date.now(), d: { games: g, categories: k } })); } catch (e) {} anwenden(neu); }
    } catch (e) { /* Grundstand bleibt */ }
  }

  alleBauen(); chips(); filtern();
  laden();
  const PS0 = window.PlaySaal;
  if (PS0) {
    const start = async () => { const a = await PS0.anbieter(); herzenAn = !!(PS0.user() || a.email || a.google || a.apple); herzen(); chips(); filtern(); };
    PS0.on('auth', start); PS0.on('bereit', start); PS0.on('favoriten', () => { herzen(); filtern(); });
    if (PS0.bereit()) start();
  }
})();
