/* PlaySaal: Accounts, Rangliste, Cloud-Spielstand und anonyme Tageszähler.
   Ohne Supabase-Daten in playsaal-config.js bleibt alles stumm und die Spiele laufen wie bisher.
   Einbinden: <script src="…/assets/playsaal-config.js"></script><script src="…/assets/playsaal.js" data-game="linke-spur"></script> */
(function () {
  'use strict';
  var script = document.currentScript;
  var ROOT = new URL('../', script.src).href;
  var SEITE = (script.dataset && script.dataset.game) || '';
  var CFG = window.PLAYSAAL_CONFIG || {};
  var SB_URL = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
  var SB_KEY = String(CFG.supabaseKey || '');
  var ONLINE = !!(SB_URL && SB_KEY);
  var AUTH_KEY = ONLINE ? 'sb-' + new URL(SB_URL).hostname.split('.')[0] + '-auth-token' : '';
  var RANG = { 'linke-spur': 'Linke Spur', 'schwindelfrei': 'Schwindelfrei', 'hochstapler': 'Hochstapler' };
  var MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var hatSitzung = function () { return ONLINE && !!ls.get(AUTH_KEY); };

  // Wiederkehrer = war schon an einem früheren Tag hier (nur dieses Gerät, nichts wird übertragen außer ja/nein)
  var heute = new Date().toISOString().slice(0, 10);
  var erster = ls.get('playsaal.seit');
  var WIEDER = !!erster && erster < heute;
  if (!erster) ls.set('playsaal.seit', heute);

  /* ---------- Verbindung ---------- */
  var clientP = null;
  function client() {
    if (!ONLINE) return Promise.reject(new Error('offline'));
    if (!clientP) {
      clientP = new Promise(function (ok, fail) {
        if (window.supabase && window.supabase.createClient) return ok();
        var s = document.createElement('script');
        s.src = ROOT + 'assets/supabase.js';
        s.onload = ok; s.onerror = function () { clientP = null; fail(new Error('supabase.js nicht geladen')); };
        document.head.appendChild(s);
      }).then(function () {
        return window.supabase.createClient(SB_URL, SB_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY }
        });
      });
    }
    return clientP;
  }
  function rpcGast(name, args) {
    var h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (SB_KEY.indexOf('sb_') !== 0) h.Authorization = 'Bearer ' + SB_KEY;   // alte anon-JWTs brauchen zusätzlich den Header
    return fetch(SB_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: h, body: JSON.stringify(args || {}), keepalive: true })
      .then(function (r) { return r.text().then(function (t) { if (!r.ok) throw new Error(t || String(r.status)); return t ? JSON.parse(t) : null; }); });
  }
  function rpc(name, args) {
    if (!ONLINE) return Promise.reject(new Error('offline'));
    if (!hatSitzung()) return rpcGast(name, args);
    return client().then(function (c) { return c.rpc(name, args || {}); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function nutzer() {
    if (!hatSitzung()) return Promise.resolve(null);
    return client().then(function (c) { return c.auth.getSession(); })
      .then(function (r) { return r.data && r.data.session ? r.data.session.user : null; })
      .catch(function () { return null; });
  }
  var profilP = null;
  function profil(neu) {
    if (!hatSitzung()) return Promise.resolve(null);
    if (!profilP || neu) profilP = rpc('mein_profil').then(function (rows) { return (rows && rows[0]) || null; }).catch(function () { profilP = null; return null; });
    return profilP;
  }

  /* ---------- Spielstände ---------- */
  var AUTO = { kombi: 0, gt: 6000, volta: 15000, strale: 35000 }, TF = { kombi: 1, gt: 1.6, volta: 2.2, strale: 3 }, TUNE = [100, 220, 400, 700, 1100];
  function wertLinkeSpur(s) {
    if (!s) return -1;
    var v = +s.coins || 0, id, teil, i;
    (s.owned || []).forEach(function (a) { v += AUTO[a] || 0; });
    for (id in (s.tune || {})) for (teil in s.tune[id]) for (i = 0; i < Math.min(5, s.tune[id][teil] | 0); i++) v += Math.round(TUNE[i] * (TF[id] || 1) / 10) * 10;
    return v;
  }
  function maxMischen(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) o[k] = (typeof b[k] === 'number' && typeof o[k] === 'number') ? Math.max(o[k], b[k]) : (k in o ? o[k] : b[k]);
    return o;
  }
  var SPIELSTAND = {
    'linke-spur': { keys: ['linkespur.v1'], mischen: function (a, b) {
      var A = a['linkespur.v1'], B = b['linkespur.v1'];
      if (!A) return b; if (!B) return a;
      var basis = wertLinkeSpur(A) >= wertLinkeSpur(B) ? A : B, andere = basis === A ? B : A, m = {}, k;
      for (k in basis) m[k] = basis[k];
      m.best = Math.max(A.best || 0, B.best || 0);
      m.bestKm = Math.max(A.bestKm || 0, B.bestKm || 0);
      m.runs = Math.max(A.runs || 0, B.runs || 0);
      m.missions = {};
      for (k in (andere.missions || {})) m.missions[k] = andere.missions[k];
      for (k in (basis.missions || {})) m.missions[k] = Math.max(basis.missions[k] | 0, m.missions[k] | 0);
      return { 'linkespur.v1': m };
    } },
    'schwindelfrei': { keys: ['schwindelfrei.best'], mischen: maxMischen },
    'hochstapler': { keys: ['hochstapler.best', 'hochstapler.bestFloors'], mischen: maxMischen },
    'richtfest': { keys: ['richtfest.save.v1'], mischen: function (a, b) {
      var A = a['richtfest.save.v1'], B = b['richtfest.save.v1'];
      if (!A) return b; if (!B) return a;
      var w = function (s) { return (s.caught || []).length * 1000 + (s.seen || []).length * 10 + ((s.stats || {}).catches || 0); };
      return w(A) > w(B) ? a : b;
    } }
  };
  function stabil(o) {
    if (Array.isArray(o)) return '[' + o.map(stabil).join(',') + ']';
    if (o && typeof o === 'object') return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + stabil(o[k]); }).join(',') + '}';
    return JSON.stringify(o);
  }
  function lokalLesen(spiel) {
    var o = {};
    SPIELSTAND[spiel].keys.forEach(function (k) { var v = ls.get(k); if (v !== null) { try { o[k] = JSON.parse(v); } catch (e) {} } });
    return o;
  }
  function lokalSchreiben(spiel, daten) {
    SPIELSTAND[spiel].keys.forEach(function (k) { if (k in daten) ls.set(k, JSON.stringify(daten[k])); });
  }
  var leer = function (o) { return !o || !Object.keys(o).length; };

  // Lokal und Cloud zusammenführen; gibt zurück, welche Spiele lokal neu geschrieben wurden
  function abgleichen() {
    var geaendert = {};
    if (!hatSitzung()) return Promise.resolve(geaendert);
    return Promise.all([client(), nutzer()]).then(function (r) {
      var c = r[0], u = r[1];
      if (!u) return geaendert;
      return c.from('saves').select('game,data').then(function (res) {
        if (res.error) throw res.error;
        var wolke = {}, hoch = [];
        (res.data || []).forEach(function (z) { wolke[z.game] = z.data; });
        Object.keys(SPIELSTAND).forEach(function (g) {
          var lok = lokalLesen(g), wo = wolke[g] || null;
          if (leer(lok) && leer(wo)) return;
          var neu = !leer(lok) && !leer(wo) ? SPIELSTAND[g].mischen(lok, wo) : (leer(wo) ? lok : wo);
          if (stabil(neu) !== stabil(lok)) { lokalSchreiben(g, neu); geaendert[g] = true; }
          if (stabil(neu) !== stabil(wo)) hoch.push({ user_id: u.id, game: g, data: neu, updated_at: new Date().toISOString() });
        });
        if (!hoch.length) return geaendert;
        return c.from('saves').upsert(hoch).then(function (x) { if (x.error) throw x.error; return geaendert; });
      });
    });
  }
  function hochladen(spiel) {
    if (!hatSitzung() || !SPIELSTAND[spiel]) return Promise.resolve();
    return Promise.all([client(), nutzer()]).then(function (r) {
      var c = r[0], u = r[1], lok = lokalLesen(spiel);
      if (!u || leer(lok)) return;
      return c.from('saves').select('data').eq('game', spiel).maybeSingle().then(function (res) {
        var neu = res.data && !leer(res.data.data) ? SPIELSTAND[spiel].mischen(lok, res.data.data) : lok;
        return c.from('saves').upsert({ user_id: u.id, game: spiel, data: neu, updated_at: new Date().toISOString() });
      });
    }).catch(function () {});
  }
  var timer = {};
  function geaendertMelden(spiel) {
    if (!hatSitzung() || !SPIELSTAND[spiel]) return;
    clearTimeout(timer[spiel]);
    timer[spiel] = setTimeout(function () { hochladen(spiel); }, 2500);
  }

  /* ---------- Läufe ---------- */
  var lauf = null;
  function laufStart(spiel) { lauf = { spiel: spiel, t0: Date.now() }; }
  function laufEnde(spiel, punkte, meta) {
    var dauer = lauf && lauf.spiel === spiel ? Math.max(1, Math.round((Date.now() - lauf.t0) / 1000)) : 1;
    lauf = null;
    var basis = { spiel: spiel };
    if (!ONLINE) return Promise.resolve(Object.assign(basis, { status: 'offline' }));
    rpc('zaehlen', { p_game: spiel, p_art: 'lauf', p_wiederkehrer: WIEDER, p_sekunden: dauer }).catch(function () {});
    geaendertMelden(spiel);
    punkte = Math.max(0, Math.floor(+punkte || 0));
    if (!RANG[spiel] || punkte <= 0) return Promise.resolve(Object.assign(basis, { status: 'ohne' }));
    if (!hatSitzung()) return Promise.resolve(Object.assign(basis, { status: 'gast' }));
    return profil().then(function (p) {
      if (!p) return Object.assign(basis, { status: 'ohne_name' });
      return rpc('lauf_melden', { p_game: spiel, p_score: punkte, p_dauer: dauer, p_meta: meta || {} }).then(function (r) {
        return Object.assign(basis, r || {}, { status: r && r.geprueft ? 'geprueft' : 'gemeldet' });
      });
    }).catch(function (e) { return Object.assign(basis, { status: 'fehler', fehler: String((e && e.message) || e) }); });
  }

  /* ---------- Hinweis am Spielende ---------- */
  var stilDa = false;
  function stil() {
    if (stilDa) return; stilDa = true;
    var s = document.createElement('style');
    s.textContent = '.ps-ergebnis{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:2px 0 10px;padding:10px 12px;border-radius:8px;'
      + 'background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2);font:inherit;font-size:15px;line-height:1.4;color:inherit;text-align:left;text-transform:none;letter-spacing:normal}'
      + '.ps-ergebnis b{font-weight:700}.ps-ergebnis span{flex:1 1 220px;min-width:0}'
      + '.ps-ergebnis a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}'
      + '.ps-ergebnis button{font:inherit;font-size:14px;color:inherit;background:none;border:1px solid rgba(255,255,255,.35);border-radius:6px;padding:4px 10px;cursor:pointer}';
    document.head.appendChild(s);
  }
  function spaeter() { var t = +ls.get('playsaal.spaeter') || 0; return Date.now() - t < 24 * 3600 * 1000; }
  function zeigeErgebnis(res, ziel, davor) {
    if (!res || !ziel) return;
    var alt = ziel.querySelector('.ps-ergebnis'); if (alt) alt.remove();
    var html = '';
    var liste = ROOT + 'rangliste.html#' + res.spiel, konto = ROOT + 'konto.html';
    if (res.status === 'gemeldet') {
      var monat = MONATE[new Date().getMonth()];
      html = '<span>' + (res.neuer_monatsbestwert ? '<b>Neuer Monatsbestwert.</b> ' : '') + '<b>Platz ' + res.platz_monat + '</b> von ' + res.spieler_monat + ' im ' + monat + '.</span><a href="' + liste + '">Zur Rangliste</a>';
    } else if (res.status === 'geprueft') {
      html = '<span>Dein Ergebnis wird geprüft, bevor es in der Rangliste erscheint.</span>';
    } else if (res.status === 'ohne_name') {
      html = '<span>Wähle einen Spielernamen, dann erscheinst du in der Rangliste.</span><a href="' + konto + '">Namen wählen</a>';
    } else if (res.status === 'gast' && !spaeter()) {
      html = '<span><b>Ab in die Rangliste?</b> Mit einem kostenlosen Account zählt dein Ergebnis, und dein Spielstand ist auf jedem Gerät sicher.</span><a href="' + konto + '">Account anlegen</a><button type="button">Später</button>';
    }
    if (!html) return;
    stil();
    var el = document.createElement('div');
    el.className = 'ps-ergebnis'; el.setAttribute('role', 'status'); el.innerHTML = html;
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (t) { el.addEventListener(t, function (e) { e.stopPropagation(); }); });
    var btn = el.querySelector('button');
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); ls.set('playsaal.spaeter', String(Date.now())); el.remove(); });
    ziel.insertBefore(el, davor || null);
  }

  /* ---------- Seitenstart ---------- */
  var bereit = Promise.resolve({});
  if (ONLINE) {
    if (SEITE) rpc('zaehlen', { p_game: SEITE, p_art: 'besuch', p_wiederkehrer: WIEDER, p_sekunden: 0 }).catch(function () {});
    if (hatSitzung()) {
      bereit = abgleichen().catch(function () { return {}; });
      // Spielstand kam von einem anderen Gerät: einmal neu laden, solange kein Lauf läuft
      if (SPIELSTAND[SEITE]) bereit.then(function (g) { if (g[SEITE] && !lauf) location.reload(); });
    }
  }

  window.PlaySaal = {
    online: ONLINE, root: ROOT, spiele: RANG,
    client: client, rpc: rpc, nutzer: nutzer, profil: profil, hatSitzung: hatSitzung,
    abgleichen: abgleichen, hochladen: hochladen, bereit: bereit,
    runStart: laufStart, runEnd: laufEnde, dirty: geaendertMelden, showResult: zeigeErgebnis,
    monat: function () { return MONATE[new Date().getMonth()]; }
  };
})();
