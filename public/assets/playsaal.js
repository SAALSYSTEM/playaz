// PlaySaal: Konten, Spielstand-Sync, Fehler melden, Statistik. Eine Datei für Portal, Spielseiten, /konto und /admin.
// Ohne Anmeldung passiert hier fast nichts: Es wird nur (auf Spielseiten) der Knopf "Fehler melden" angelegt.
// Der schwere Supabase-Client lädt erst, wenn eine Sitzung existiert oder jemand sich anmelden will.
// Spielen funktioniert immer weiter, auch wenn Supabase ausfällt: alle Netzwerkaufrufe sind mit Zeitlimit und try/catch gekapselt.
(function () {
  'use strict';
  const C = window.PLAYSAAL_CFG;
  if (!C || !C.url || window.PlaySaal) return;

  const HOST_OK = location.origin === C.siteUrl || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const SLUG = (location.pathname.match(/^\/spiele\/([a-z0-9-]+)\/?$/) || [])[1] || null;
  const SPIEL_ID = SLUG && C.spiele[SLUG] || null;
  const SPIEL_IDS = [...new Set(Object.values(C.spiele))];
  const SLUG_VON_ID = Object.fromEntries(Object.entries(C.spiele).map(([s, i]) => [i, s]));
  const KEY_OK = /^[a-z]+\.[A-Za-z0-9.]{1,40}$/;
  const META_KEY = 'playsaal.sync';
  const AVATARE = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦖', '🚂', '🚒', '🚀', '🧙', '🐢', '🦄'];

  // ---------------------------------------------------------------- Hilfen
  const ls = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) {} },
    keys() { const o = []; try { const s = window.localStorage; for (let i = 0; i < s.length; i++) o.push(s.key(i)); } catch (e) {} return o; }
  };
  const json = (s, d) => { try { const v = JSON.parse(s); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  const hash = (obj) => {
    const str = JSON.stringify(Object.keys(obj).sort().map((k) => [k, obj[k]]));
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const handlers = {};
  const on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  const emit = (ev, a) => { (handlers[ev] || []).slice().forEach((f) => { try { f(a); } catch (e) {} }); };
  const gueltigerRueckweg = (p) => typeof p === 'string' && /^\/(?!\/)[A-Za-z0-9\-._~\/%?=&#,+:@!$*;]{0,300}$/.test(p) && !p.startsWith('/konto') && !p.includes('..');
  const testlauf = () => !!(navigator.webdriver || C.test || /[?&]playsaal-test\b/.test(location.search) || ss.get('playsaal.test') === '1');

  // ---------------------------------------------------------------- Zustand
  const S = { bereit: false, user: null, profil: null, token: null, sync: 'gast', syncZeit: 0, favs: new Set(), anbieterCache: null };
  let M = json(ls.get(META_KEY), null) || { uid: null, games: {}, skip: {} };
  M.games = M.games || {}; M.skip = M.skip || {};
  const metaSpeichern = () => ls.set(META_KEY, JSON.stringify(M));

  // ---------------------------------------------------------------- REST (ohne Client, mit Zeitlimit)
  async function rpc(name, args, o) {
    o = o || {};
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), o.timeout || 8000);
    try {
      const h = { apikey: C.key, 'Content-Type': 'application/json' };
      if (o.token) h.Authorization = 'Bearer ' + o.token;
      const r = await fetch(C.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: h, body: JSON.stringify(args || {}), keepalive: !!o.keepalive, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) { let b = null; try { b = await r.json(); } catch (e) {} return { fehler: true, status: r.status, code: b && b.code, text: b && b.message }; }
      return { daten: await r.json() };
    } catch (e) {
      return { fehler: true, netz: true };
    } finally { clearTimeout(t); }
  }

  // ---------------------------------------------------------------- Supabase-Client (lazy)
  let clientP = null;
  function laden(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Laden fehlgeschlagen: ' + src)); document.head.appendChild(s); });
  }
  function client() {
    if (clientP) return clientP;
    clientP = (async () => {
      if (!(window.supabase && window.supabase.createClient)) await laden('/assets/supabase.min.js');
      const c = window.supabase.createClient(C.url, C.key, { auth: { storageKey: 'playsaal.auth', flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
      c.auth.onAuthStateChange((ev, session) => { if (ev === 'INITIAL_SESSION') return; setTimeout(() => sitzungSetzen(session, ev), 0); });
      return c;
    })();
    clientP.catch(() => { clientP = null; });
    return clientP;
  }
  const hatSitzung = () => !!ls.get('playsaal.auth');

  async function anbieter() {
    if (S.anbieterCache) return S.anbieterCache;
    const aus = { email: false, google: false, apple: false };
    if (!HOST_OK) return aus;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(C.url + '/auth/v1/settings', { headers: { apikey: C.key }, signal: ctl.signal }); clearTimeout(t);
      const j = await r.json(); const ex = (j && j.external) || {};
      const frei = C.anmelden || {};
      const res = { email: !!(frei.email && ex.email), google: !!(frei.google && ex.google), apple: !!(frei.apple && ex.apple) };
      S.anbieterCache = res; return res;
    } catch (e) { return aus; }
  }

  // ---------------------------------------------------------------- Sitzung, Profil
  let bereitFuer = null;
  async function sitzungSetzen(session, ev) {
    const neu = session && session.user || null;
    S.token = session ? session.access_token : null;
    S.user = neu;
    if (!neu) { bereitFuer = null; S.profil = null; S.favs = new Set(); setSync('gast'); emit('auth', null); return; }
    if (bereitFuer !== neu.id) {
      bereitFuer = neu.id;
      kontoWechselPruefen(neu.id);
      emit('auth', neu);
      await profilLaden();
      favoritenLaden();
      syncStart();
    }
  }
  async function init() {
    if (!HOST_OK) { S.bereit = true; emit('bereit'); return; }
    if (hatSitzung() || /[?&]code=/.test(location.search)) {
      try {
        const c = await client();
        const r = await c.auth.getSession();
        await sitzungSetzen(r.data && r.data.session, 'INITIAL');
      } catch (e) { /* Spielen geht ohne Konto weiter */ }
    } else setSync('gast');
    S.bereit = true; emit('bereit');
  }

  async function profilLaden() {
    try {
      const c = await client();
      const r = await c.from('profiles').select('display_name,avatar').maybeSingle();
      S.profil = r.data ? { name: r.data.display_name, avatar: r.data.avatar } : null;
    } catch (e) { S.profil = S.profil || null; }
    emit('profil', S.profil);
    if (!S.profil && !ss.get('playsaal.profil.spaeter') && !SPIEL_ID) setTimeout(() => ui().profil({ erst: true }), 400);
  }
  async function profilSpeichern(name, avatar) {
    const r = await rpc('profil_speichern', { p_name: name, p_avatar: avatar }, { token: S.token });
    if (r.fehler) return { ok: false, fehler: r.netz ? 'netz' : 'unbekannt' };
    if (r.daten && r.daten.ok) { S.profil = { name: r.daten.name, avatar: r.daten.avatar }; emit('profil', S.profil); }
    return r.daten;
  }
  const nameFrei = async (name) => { const r = await rpc('name_frei', { p_name: name }, { token: S.token }); return r.fehler ? { frei: false, fehler: 'netz' } : r.daten; };

  // ---------------------------------------------------------------- Anmelden / Abmelden
  const rueckwegMerken = () => { const p = location.pathname + location.search; if (gueltigerRueckweg(p)) ls.set('playsaal.rueck', JSON.stringify({ p, t: Date.now() })); };
  async function oauth(provider) {
    if (!HOST_OK) return { fehler: 'host' };
    rueckwegMerken();
    const c = await client();
    const r = await c.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + '/konto' } });
    return r.error ? { fehler: r.error.message } : { ok: true };
  }
  async function codeSenden(email) {
    const letzte = Number(ls.get('playsaal.otp.t') || 0);
    if (Date.now() - letzte < 60000) return { fehler: 'warten', sek: Math.ceil((60000 - (Date.now() - letzte)) / 1000) };
    rueckwegMerken();
    const c = await client();
    const r = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (r.error) {
      const st = r.error.status, code = r.error.code || '';
      if (st === 429 || /rate_limit/.test(code)) return { fehler: 'zu_oft' };
      if (/email_address_invalid|validation/.test(code)) return { fehler: 'adresse' };
      return { fehler: 'senden' };
    }
    ls.set('playsaal.otp.t', String(Date.now()));
    return { ok: true, gesendet: Date.now() };
  }
  async function codePruefen(email, token, gesendet) {
    const c = await client();
    const r = await c.auth.verifyOtp({ email, token, type: 'email' });
    if (r.error) {
      if (r.error.status === 429) return { fehler: 'zu_oft' };
      return { fehler: gesendet && Date.now() - gesendet > 3600000 ? 'abgelaufen' : 'falsch' };
    }
    ls.del('playsaal.rueck');
    return { ok: true };
  }
  function unsynchronisiert() {
    return SPIEL_IDS.filter((id) => { const k = snapshot(id); const m = M.games[id]; return k && m && hash(k) !== m.hash; });
  }
  async function abmelden(o) {
    o = o || {};
    if (S.user) {
      await syncAlleJetzt().catch(() => {});
      const offen = unsynchronisiert();
      if (offen.length && !o.erzwingen) return { offen: offen };
      lokaleSyncDatenEntfernen();
    }
    try { const c = await client(); await c.auth.signOut({ scope: 'local' }); } catch (e) {}
    ls.del('playsaal.auth');
    M = { uid: null, games: {}, skip: {} }; metaSpeichern();
    await sitzungSetzen(null, 'SIGNED_OUT');
    return { ok: true };
  }
  function lokaleSyncDatenEntfernen() {
    Object.keys(M.games).forEach((id) => { const g = spielInfo(id); if (g) snapshotKeys(g.prefix).forEach((k) => ls.del(k)); });
    ls.keys().filter((k) => k.startsWith('playsaal.sicherung.')).forEach((k) => ls.del(k));
  }
  // Anderes Konto auf demselben Gerät: Stände des vorigen Kontos wandern in eine unsichtbare Sicherung und tauchen nie im neuen Konto auf.
  function kontoWechselPruefen(uid) {
    if (M.uid && M.uid !== uid) {
      const q = {};
      Object.keys(M.games).forEach((id) => { const g = spielInfo(id); if (!g) return; const keys = snapshot(id); if (keys) q[id] = keys; snapshotKeys(g.prefix).forEach((k) => ls.del(k)); });
      if (Object.keys(q).length) ls.set('playsaal.quarantaene.' + M.uid, JSON.stringify({ at: Date.now(), spiele: q }));
      M = { uid, games: {}, skip: {} };
    }
    M.uid = uid; metaSpeichern();
  }

  // ---------------------------------------------------------------- Spielstand-Sync
  let infoP = null;
  function infoLaden() {
    if (!infoP) infoP = (window.PlaySaalUmzug ? Promise.resolve() : laden('/assets/umzug.js')).catch(() => {});
    return infoP;
  }
  function spielInfo(id) {
    const u = window.PlaySaalUmzug; const s = u && u.SPIELE.find((x) => x.id === id);
    if (s) return s;
    const slug = SLUG_VON_ID[id], prefix = (C.praefixe || {})[id];
    return slug && prefix ? { id, name: slug, prefix, info: null } : null;
  }
  function snapshotKeys(prefix) { return ls.keys().filter((k) => k.startsWith(prefix) && KEY_OK.test(k) && !/muted$/.test(k)); }
  function snapshot(id) {
    const g = spielInfo(id); if (!g) return null;
    const keys = {}; snapshotKeys(g.prefix).forEach((k) => { const v = ls.get(k); if (typeof v === 'string') keys[k] = v; });
    return Object.keys(keys).length ? keys : null;
  }
  function beschreibe(id, keys) {
    const g = spielInfo(id); let r = { text: '', wert: 0 };
    try { if (g && g.info) { const x = g.info(keys); r = { text: x.text || '', wert: Number(x.wert) || 0 }; } } catch (e) {}
    return r;
  }
  function keysAnwenden(id, keys) {
    const g = spielInfo(id); if (!g) return false;
    const alt = snapshot(id);
    if (alt) ls.set('playsaal.sicherung.' + id, JSON.stringify({ at: Date.now(), keys: alt }));
    snapshotKeys(g.prefix).forEach((k) => ls.del(k));
    for (const k of Object.keys(keys)) { if (!k.startsWith(g.prefix) || !KEY_OK.test(k) || typeof keys[k] !== 'string') continue; if (!ls.set(k, keys[k])) return false; }
    return true;
  }
  const geraet = () => { const u = navigator.userAgent; const os = /iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Gerät'; const br = /Firefox/.test(u) ? 'Firefox' : /Edg/.test(u) ? 'Edge' : /Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : ''; return (os + (br ? ' · ' + br : '')).slice(0, 40); };

  function setSync(st) { if (S.sync !== st) { S.sync = st; S.syncZeit = Date.now(); emit('sync', st); } }
  const SYNC_TEXT = { gast: 'Nur auf diesem Gerät', ok: 'Gespeichert', ausstehend: 'Synchronisierung ausstehend', speichert: 'Wird gespeichert …', fehler: 'Speichern nicht möglich', offline: 'Offline · wird später gespeichert', konflikt: 'Stand wählen nötig' };

  async function hochladen(id, keys, base, hinweis) {
    const b = beschreibe(id, keys);
    if (JSON.stringify(keys).length > 1400000) return { status: 'ungueltig' };
    const r = await rpc('spielstand_speichern', { p_game: id, p_format: 1, p_data: { keys }, p_progress: b.wert, p_summary: b.text.slice(0, 120), p_base: base || 0, p_device: geraet(), p_saved_at: new Date().toISOString() }, { token: S.token, keepalive: !!(hinweis && hinweis.keepalive), timeout: 12000 });
    if (r.fehler) return { status: r.netz ? 'netz' : (r.status === 401 ? 'auth' : 'fehler') };
    const d = r.daten || {};
    if (d.status === 'ok') { M.games[id] = { rev: d.revision, hash: hash(keys), at: Date.now() }; delete M.skip[id]; metaSpeichern(); }
    return d;
  }
  async function serverStaende() {
    const c = await client();
    const r = await c.from('saves').select('game_id,revision,format,data,progress,summary,device,client_saved_at,updated_at');
    if (r.error) throw r.error;
    const o = {}; (r.data || []).forEach((z) => { o[z.game_id] = z; }); return o;
  }
  const serverKeys = (z) => (z && z.data && typeof z.data.keys === 'object' && z.data.keys) || null;
  let interagiert = false;
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, () => { interagiert = true; }, { capture: true, passive: true, once: true }));

  // Abgleich eines Spiels. Liefert: 'gleich' | 'hoch' | 'runter' | 'angebot' | 'konflikt' | 'netz' | 'fehler'
  async function abgleichen(id, server, o) {
    o = o || {};
    const lokal = snapshot(id); const m = M.games[id]; const sk = serverKeys(server);
    if (!lokal && !sk) return 'gleich';
    if (lokal && !server) {
      if (M.skip[id] === hash(lokal)) return 'gleich';
      return 'angebot';
    }
    if (!lokal && sk) return 'runter';
    const lh = hash(lokal), sh = hash(sk);
    if (lh === sh) { M.games[id] = { rev: server.revision, hash: lh, at: Date.now() }; metaSpeichern(); return 'gleich'; }
    if (m) {
      const lokalGeaendert = lh !== m.hash, serverGeaendert = server.revision !== m.rev;
      if (!lokalGeaendert && !serverGeaendert) return 'gleich';
      if (lokalGeaendert && !serverGeaendert) { const r = await hochladen(id, lokal, server.revision); return r.status === 'ok' ? 'hoch' : r.status === 'konflikt' ? 'konflikt' : r.status === 'netz' ? 'netz' : 'fehler'; }
      if (!lokalGeaendert && serverGeaendert) return 'runter';
    }
    return 'konflikt';
  }
  function anwendenVonServer(id, server) {
    const sk = serverKeys(server); if (!sk) return false;
    if (!keysAnwenden(id, sk)) return false;
    M.games[id] = { rev: server.revision, hash: hash(snapshot(id) || sk), at: Date.now() }; metaSpeichern();
    return true;
  }

  let syncLaeuft = null;
  function syncStart() { if (!S.user) return; syncAlleJetzt().catch(() => {}); }
  function syncAlleJetzt() {
    if (!S.user) return Promise.resolve();
    if (syncLaeuft) return syncLaeuft;
    syncLaeuft = (async () => {
      setSync('speichert');
      try {
        await infoLaden();
        const ids = SPIEL_ID ? [SPIEL_ID] : SPIEL_IDS;
        const server = await serverStaende();
        const angebote = [], konflikte = []; let neuGeladen = false, netzFehler = false;
        for (const id of ids) {
          const z = server[id] || null;
          const a = await abgleichen(id, z, { nurPruefen: id === SPIEL_ID });
          if (a === 'angebot') angebote.push(id);
          else if (a === 'konflikt') konflikte.push(id);
          else if (a === 'netz') netzFehler = true;
          else if (a === 'runter') {
            if (id === SPIEL_ID) { if (!interagiert && !ss.get('playsaal.neugeladen.' + id)) { if (anwendenVonServer(id, z)) { ss.set('playsaal.neugeladen.' + id, '1'); neuGeladen = true; } } else { konflikte.push(id); } }
            else if (!anwendenVonServer(id, z)) netzFehler = true;
          }
        }
        if (neuGeladen) { location.reload(); return; }
        if (angebote.length) await ui().uebernahme(angebote, server);
        for (const id of konflikte) await ui().konflikt(id, server[id]);
        const offen = unsynchronisiert();
        setSync(netzFehler ? 'ausstehend' : konflikte.length && SPIEL_ID && konflikte.includes(SPIEL_ID) ? 'konflikt' : offen.length ? 'ausstehend' : 'ok');
        emit('synchronisiert');
      } catch (e) {
        setSync(navigator.onLine === false ? 'offline' : 'ausstehend');
      } finally { syncLaeuft = null; }
    })();
    return syncLaeuft;
  }
  async function entscheidung(id, wahl, server) {
    // wahl: 'lokal' = dieses Gerät gewinnt (überschreibt das Konto ausdrücklich), 'konto' = Konto-Stand übernehmen
    if (wahl === 'konto') { const ok = anwendenVonServer(id, server); if (ok && id === SPIEL_ID) { ss.set('playsaal.neugeladen.' + id, '1'); location.reload(); } return ok; }
    const lokal = snapshot(id); if (!lokal) return false;
    const r = await hochladen(id, lokal, server ? server.revision : 0);
    return r.status === 'ok';
  }
  async function uebernehmen(id) { const k = snapshot(id); if (!k) return false; const r = await hochladen(id, k, 0); return r.status === 'ok' || r.status === 'konflikt'; }
  function nichtUebernehmen(id) { const k = snapshot(id); if (k) { M.skip[id] = hash(k); metaSpeichern(); } }

  // Automatisches Speichern auf Spielseiten: bündeln (höchstens alle 10 s), bei Verlassen sofort
  let letzterUpload = 0, schreibt = false;
  async function speicherPunkt(erzwingen, keepalive) {
    if (!S.user || !SPIEL_ID || schreibt || S.sync === 'konflikt') return;
    const k = snapshot(SPIEL_ID); const m = M.games[SPIEL_ID];
    if (!k) return;
    if (m && hash(k) === m.hash) { if (S.sync !== 'ok' && S.sync !== 'speichert') setSync('ok'); return; }
    if (!m && M.skip[SPIEL_ID]) return; // Übernahme wurde abgelehnt: nichts automatisch hochladen
    if (!erzwingen && Date.now() - letzterUpload < 10000) { setSync('ausstehend'); return; }
    if (navigator.onLine === false) { setSync('offline'); return; }
    schreibt = true; letzterUpload = Date.now(); setSync('speichert');
    try {
      const r = await hochladen(SPIEL_ID, k, m ? m.rev : 0, { keepalive });
      if (r.status === 'ok') setSync('ok');
      else if (r.status === 'konflikt') { setSync('konflikt'); await ui().konflikt(SPIEL_ID, r.server); setSync(unsynchronisiert().length ? 'ausstehend' : 'ok'); }
      else setSync(r.status === 'netz' ? (navigator.onLine === false ? 'offline' : 'ausstehend') : 'fehler');
    } finally { schreibt = false; }
  }
  if (SPIEL_ID) {
    setInterval(() => speicherPunkt(false), 15000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') speicherPunkt(true, true); });
    addEventListener('pagehide', () => speicherPunkt(true, true));
    addEventListener('online', () => { if (S.user) syncAlleJetzt().catch(() => {}); });
    addEventListener('offline', () => { if (S.user) setSync('offline'); });
  }

  // ---------------------------------------------------------------- Favoriten
  async function favoritenLaden() {
    try { const c = await client(); const r = await c.from('favorites').select('game_slug'); if (!r.error) { S.favs = new Set((r.data || []).map((x) => x.game_slug)); emit('favoriten', S.favs); } } catch (e) {}
  }
  async function favorit(slug, an) {
    if (!S.user) return { fehler: 'anmelden' };
    try {
      const c = await client();
      const r = an ? await c.from('favorites').insert({ user_id: S.user.id, game_slug: slug }) : await c.from('favorites').delete().eq('game_slug', slug);
      if (r.error && r.error.code !== '23505') return { fehler: 'speichern' };
      if (an) S.favs.add(slug); else S.favs.delete(slug);
      emit('favoriten', S.favs); return { ok: true };
    } catch (e) { return { fehler: 'netz' }; }
  }

  // ---------------------------------------------------------------- Fehler melden
  async function fehlerMelden(text, mitTechnik) {
    const ctx = {};
    if (mitTechnik) { ctx.ansicht = Math.round(innerWidth) + 'x' + Math.round(innerHeight); ctx.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0; const u = navigator.userAgent; ctx.browser = (/Firefox\/(\d+)/.exec(u) || /Edg\/(\d+)/.exec(u) || /Chrome\/(\d+)/.exec(u) || /Version\/(\d+).*Safari/.exec(u) || [])[0] || ''; }
    const r = await rpc('fehler_melden', { p_game: SLUG, p_version: C.build || '', p_message: text, p_context: ctx, p_test: testlauf() });
    if (r.fehler) return { ok: false, fehler: r.netz ? 'netz' : 'unbekannt' };
    return r.daten;
  }

  // ---------------------------------------------------------------- Statistik (nur wenn C.statistik)
  const Stat = (function () {
    if (!C.statistik || !SPIEL_ID || !SLUG || navigator.doNotTrack === '1' || window.doNotTrack === '1') return null;
    const sid = (crypto.randomUUID && crypto.randomUUID()) || ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    const queue = []; let aktivSek = 0, zeitNr = 0, letzteAktion = 0, gestartet = false, letzterWert = null;
    const aktivJetzt = () => document.visibilityState === 'visible' && Date.now() - letzteAktion < 15000;
    function aktion() { letzteAktion = Date.now(); if (!gestartet) { gestartet = true; queue.push({ k: 'start', r: 'p' }); } }
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, aktion, { capture: true, passive: true }));
    setInterval(() => {
      if (aktivJetzt()) aktivSek++;
      if (aktivSek >= 30) { queue.push({ k: 'zeit', r: 't' + (zeitNr++), s: aktivSek }); aktivSek = 0; }
      if (queue.length) senden(false);
    }, 1000);
    function senden(ende) {
      if (ende && aktivSek >= 5) { queue.push({ k: 'zeit', r: 't' + (zeitNr++), s: aktivSek }); aktivSek = 0; }
      if (!queue.length) return;
      const evs = queue.splice(0, 30);
      rpc('statistik_melden', { p_sid: sid, p_game: SLUG, p_events: evs, p_test: testlauf() }, { keepalive: ende, timeout: 5000 }).then((r) => { if (r.fehler && r.netz && queue.length < 60) queue.unshift(...evs); });
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') senden(true); });
    addEventListener('pagehide', () => senden(true));
    // "Fortschritt": steigt der Spielstand-Wert (neues Level/Rekord), zählt das als abgeschlossener Schritt
    setInterval(() => {
      if (!window.PlaySaalUmzug) return; const g = spielInfo(SPIEL_ID); const k = snapshot(SPIEL_ID); if (!g || !g.info || !k) return;
      const w = beschreibe(SPIEL_ID, k).wert; if (letzterWert !== null && w > letzterWert) queue.push({ k: 'level', r: String(Math.round(w)).slice(0, 24) }); letzterWert = w;
    }, 5000);
    infoLaden();
    return { sid };
  })();

  // ---------------------------------------------------------------- Oberfläche (Shadow DOM, eigene Farben)
  let uiObj = null;
  function ui() { return uiObj || (uiObj = baueUi()); }

  function baueUi() {
    const host = document.createElement('div'); host.id = 'playsaal-ui';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;left:0;top:0;width:0;height:0';
    const root = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = `
:host{all:initial}*{box-sizing:border-box}
.w{font:16px/1.45 "Barlow","Segoe UI",system-ui,sans-serif;color:#f6f7f9;-webkit-user-select:text;user-select:text;-webkit-text-size-adjust:100%}
button{font:inherit;color:inherit;cursor:pointer}
button:focus-visible,input:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #FFD21C;outline-offset:2px}
.tab{position:fixed;left:env(safe-area-inset-left,0px);top:50%;transform:translateY(-50%);width:22px;height:58px;border:1px solid rgba(246,247,249,.22);border-left:0;border-radius:0 14px 14px 0;background:rgba(17,18,26,.62);color:#f6f7f9;padding:0;display:flex;align-items:center;justify-content:center;opacity:.5;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.tab:hover,.tab:focus-visible,.tab[aria-expanded="true"]{opacity:1}
.tab i{width:8px;height:8px;border-radius:50%;background:rgba(246,247,249,.5);display:block}
.tab[data-s="ok"] i{background:#FFD21C}
.tab[data-s="ausstehend"] i,.tab[data-s="offline"] i,.tab[data-s="speichert"] i{background:#FF9200}
.tab[data-s="fehler"] i,.tab[data-s="konflikt"] i{background:#FF4A13}
.menue{position:fixed;left:calc(env(safe-area-inset-left,0px) + 30px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.menue[hidden]{display:none}
.menue button{height:40px;border-radius:20px;border:1px solid rgba(246,247,249,.22);background:rgba(17,18,26,.92);color:#f6f7f9;padding:0 14px;display:inline-flex;align-items:center;gap:8px;font-size:14px}
.menue svg{width:16px;height:16px}
.menue .pill[hidden]{display:none}
.menue .pill[data-s="ok"]::before{content:"";width:8px;height:8px;border-radius:50%;background:#FFD21C;display:inline-block}
.menue .pill[data-s="ausstehend"]::before,.menue .pill[data-s="offline"]::before,.menue .pill[data-s="speichert"]::before{content:"";width:8px;height:8px;border-radius:50%;background:#FF9200;display:inline-block}
.menue .pill[data-s="fehler"]::before,.menue .pill[data-s="konflikt"]::before{content:"";width:8px;height:8px;border-radius:50%;background:#FF4A13;display:inline-block}
dialog{border:1px solid rgba(246,247,249,.14);border-radius:20px;background:#1a1b26;color:#f6f7f9;padding:0;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.6)}
dialog::backdrop{background:rgba(5,6,10,.72)}
.in{padding:20px 18px 18px;display:grid;gap:12px}
h2{margin:0;font:700 22px/1.2 "Barlow","Segoe UI",system-ui,sans-serif}
p{margin:0;color:#b6b9c8}
p.klein{font-size:14px}
.btn{min-height:46px;border-radius:999px;border:1px solid rgba(246,247,249,.18);background:#232534;font-weight:700;padding:0 18px;display:flex;align-items:center;justify-content:center;gap:10px}
.btn.ja{background:#FFD21C;color:#11121A;border-color:#FFD21C}
.btn.ja:hover{background:#FFDD4D}
.btn[disabled]{opacity:.5;cursor:default}
.btn svg{width:20px;height:20px}
input[type=email],input[type=text],input[type=search],textarea{width:100%;min-height:46px;border-radius:12px;border:1px solid rgba(246,247,249,.2);background:#11121A;color:#f6f7f9;font:inherit;font-size:17px;padding:10px 12px}
textarea{min-height:110px;resize:vertical}
.code{letter-spacing:.35em;text-align:center;font-size:24px!important;font-variant-numeric:tabular-nums}
.f{min-height:20px;font-size:14px}.f.e{color:#FFB366}.f.g{color:#FFD21C}
.av{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.av button{aspect-ratio:1;border-radius:12px;border:2px solid transparent;background:#232534;font-size:24px;line-height:1}
.av button[aria-pressed=true]{border-color:#FFD21C;background:#2c2e41}
.zeile{display:flex;gap:10px;align-items:center;justify-content:space-between}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.karte{border:1px solid rgba(246,247,249,.16);border-radius:14px;padding:10px 12px;display:grid;gap:3px;background:#11121A}
.karte b{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#FF9200}
.karte span{font-size:15px}.karte small{color:#b6b9c8;font-size:12.5px}
.liste{display:grid;gap:6px;max-height:34dvh;overflow:auto}
label.ck{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:12px;background:#11121A;border:1px solid rgba(246,247,249,.12)}
label.ck input{width:20px;height:20px;margin-top:2px;accent-color:#FFD21C}
.trenn{display:flex;align-items:center;gap:10px;color:#b6b9c8;font-size:13px}.trenn::before,.trenn::after{content:"";height:1px;background:rgba(246,247,249,.14);flex:1}
.x{position:absolute;right:8px;top:8px;width:40px;height:40px;border-radius:50%;border:0;background:transparent;font-size:22px}
.toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 56px);transform:translateX(-50%);max-width:min(440px,calc(100vw - 24px));background:#232534;border:1px solid rgba(255,146,0,.6);border-radius:14px;padding:10px 14px;font-size:15px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.toast .btn{min-height:36px;margin-top:8px}
@media (prefers-reduced-motion:no-preference){dialog[open]{animation:ein .16s ease-out}@keyframes ein{from{opacity:0;transform:translateY(8px)}}}
`;
    const wrap = document.createElement('div'); wrap.className = 'w';
    root.append(css, wrap);
    // Eingaben im Dialog dürfen laufende Spiele nicht steuern
    ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'wheel'].forEach((e) => wrap.addEventListener(e, (ev) => { if (ev.type === 'keydown' && ev.key === 'Escape') return; ev.stopPropagation(); }));
    const montieren = () => { if (!host.isConnected) (document.body || document.documentElement).appendChild(host); };
    const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }); kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(c))); return e; };
    const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); s.append(p); return s; };
    const ICON = { flagge: 'M5 21V4M5 4h11l-2 4 2 4H5', google: 'M21 12.2c0-.6 0-1.1-.1-1.6H12v3.1h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2zM12 21c2.4 0 4.5-.8 6-2.2l-3-2.3a5.6 5.6 0 0 1-8.3-2.9H3.6v2.4A9 9 0 0 0 12 21zM6.7 13.6a5.4 5.4 0 0 1 0-3.2V8H3.6a9 9 0 0 0 0 8.1zM12 6.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 3.6 8l3.1 2.4A5.4 5.4 0 0 1 12 6.6z', apple: 'M12 7.5c-3 0-5 2.4-5 5.800 0 3.400 2 6.700 4 6.700.8 0 1-.4 1-.4s.2.4 1 .4c2 0 4-3.300 4-6.700 0-3.400-2-5.800-5-5.800zM12 7.500c0-2 1-3.500 3-4.500', mail: 'M3 6h18v12H3zM3 7l9 6 9-6' };

    let aktiv = null;
    // Dialoge laufen nacheinander: ein neuer wartet, bis der offene geschlossen ist (nichts wird weggedrückt, z. B. die Übernahme-Frage).
    let kette = Promise.resolve();
    function dialog(inhalt, opts) {
      const lauf = kette.then(() => oeffneDialog(inhalt, opts));
      kette = lauf.catch(() => {});
      return lauf;
    }
    function oeffneDialog(inhalt, opts) {
      montieren();
      const d = el('dialog', { 'aria-label': opts && opts.label || 'PlaySaal' });
      const zu = (ergebnis) => { d._ergebnis = ergebnis; try { d.close(); } catch (e) {} };
      const box = el('div', { class: 'in' });
      d.append(box);
      if (!(opts && opts.ohneX)) d.append(el('button', { class: 'x', type: 'button', 'aria-label': 'Schließen', onclick: () => zu(null), text: '×' }));
      d.addEventListener('cancel', (e) => { if (opts && opts.ohneX) e.preventDefault(); });
      const p = new Promise((res) => d.addEventListener('close', () => { d.remove(); if (aktiv === d) aktiv = null; res(d._ergebnis === undefined ? null : d._ergebnis); }));
      wrap.append(d);
      inhalt(box, zu);
      aktiv = d;
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
      return p;
    }
    const meldung = (text, art) => el('div', { class: 'f ' + (art || ''), role: 'status', 'aria-live': 'polite', text: text || '' });
    function toast(text, knopf) {
      montieren();
      wrap.querySelectorAll('.toast').forEach((t) => t.remove());
      const t = el('div', { class: 'toast', role: 'status' }, text);
      if (knopf) t.append(el('button', { class: 'btn ja', type: 'button', text: knopf.text, onclick: () => { t.remove(); knopf.fn(); } }));
      wrap.append(t);
      if (!knopf) setTimeout(() => t.remove(), 4500);
      return t;
    }

    // ---- Anmelden
    const TEXT = { warten: (s) => 'Bitte kurz warten: ein neuer Code geht in ' + s + ' Sekunden.', zu_oft: 'Zu viele Anfragen. Bitte in ein paar Minuten noch einmal versuchen.', adresse: 'Diese E-Mail-Adresse kann nicht verwendet werden.', senden: 'Der Code konnte nicht gesendet werden. Bitte später noch einmal versuchen.', falsch: 'Der Code stimmt nicht oder ist abgelaufen. Prüfe die Eingabe oder fordere einen neuen Code an.', abgelaufen: 'Der Code ist abgelaufen. Fordere einen neuen Code an.' };
    async function anmelden(o) {
      o = o || {};
      const a = await anbieter();
      if (!a.email && !a.google && !a.apple) { toast('Die Anmeldung ist noch nicht freigeschaltet. Spielen geht wie gewohnt.'); return null; }
      return dialog((box, zu) => {
        const kopf = el('h2', { text: 'Anmelden' });
        const info = el('p', { text: 'Freiwillig. So bleiben dein Fortschritt und deine Favoriten auf allen Geräten erhalten. Spielen geht auch ohne Konto.' });
        const fb = meldung();
        box.append(kopf, info);
        const start = () => {
          box.replaceChildren(kopf, info);
          if (a.google) box.append(el('button', { class: 'btn', type: 'button', onclick: (e) => starteOauth('google', e.currentTarget) }, svg(ICON.google), 'Mit Google anmelden'));
          if (a.apple) box.append(el('button', { class: 'btn', type: 'button', onclick: (e) => starteOauth('apple', e.currentTarget) }, svg(ICON.apple), 'Mit Apple anmelden'));
          if (a.email) {
            if (a.google || a.apple) box.append(el('div', { class: 'trenn', text: 'oder' }));
            const inp = el('input', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'deine@email.de', 'aria-label': 'E-Mail-Adresse', maxlength: '254' });
            const senden = el('button', { class: 'btn ja', type: 'button', text: 'Code per E-Mail senden' });
            const alter = el('input', { type: 'checkbox', 'aria-label': 'Ich bin mindestens 16 Jahre alt' });
            const alterZeile = el('label', { class: 'ck' }, alter, el('span', {}, 'Ich bin mindestens 16 Jahre alt.', el('br'), el('small', { text: 'Ein Konto ist erst ab 16 Jahren möglich. Spielen geht ohne Konto in jedem Alter.' })));
            const form = el('form', { novalidate: true, style: 'display:grid;gap:10px' }, inp, alterZeile, senden, fb);
            form.addEventListener('submit', (e) => { e.preventDefault(); senden.click(); });
            senden.addEventListener('click', async () => {
              const mail = inp.value.trim();
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(mail)) { fb.className = 'f e'; fb.textContent = 'Bitte gib eine gültige E-Mail-Adresse ein.'; inp.focus(); return; }
              if (!alter.checked) { fb.className = 'f e'; fb.textContent = 'Bitte bestätige, dass du mindestens 16 Jahre alt bist.'; return; }
              senden.disabled = true; fb.className = 'f'; fb.textContent = 'Code wird gesendet …';
              const r = await codeSenden(mail).catch(() => ({ fehler: 'senden' }));
              senden.disabled = false;
              if (r.ok) return codeSchritt(mail, r.gesendet);
              fb.className = 'f e'; fb.textContent = r.fehler === 'warten' ? TEXT.warten(r.sek) : (TEXT[r.fehler] || TEXT.senden);
            });
            box.append(form);
          }
          box.append(el('p', { class: 'klein', text: 'Kein Passwort nötig. Dein Name und deine E-Mail-Adresse werden nie öffentlich angezeigt.' }));
        };
        async function starteOauth(p, btn) { btn.disabled = true; const r = await oauth(p).catch(() => ({ fehler: 'x' })); if (r.fehler) { btn.disabled = false; toast('Die Anmeldung hat nicht geklappt. Bitte noch einmal versuchen.'); } }
        function codeSchritt(mail, gesendet) {
          const inp = el('input', { type: 'text', class: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', placeholder: '••••••', 'aria-label': 'Code aus der E-Mail' });
          const ok = el('button', { class: 'btn ja', type: 'button', text: 'Bestätigen' });
          const neu = el('button', { class: 'btn', type: 'button', text: 'Neuen Code anfordern' });
          const zurueck = el('button', { class: 'btn', type: 'button', text: 'Andere E-Mail-Adresse', onclick: start });
          const f2 = meldung('Wir haben einen Code an ' + mail + ' geschickt. Er gilt eine Stunde.');
          const form = el('form', { novalidate: true, style: 'display:grid;gap:10px' }, inp, ok, f2, neu, zurueck);
          box.replaceChildren(el('h2', { text: 'Code eingeben' }), form);
          setTimeout(() => inp.focus(), 50);
          let versuche = 0;
          const tick = () => { const rest = Math.ceil((60000 - (Date.now() - Number(ls.get('playsaal.otp.t') || 0))) / 1000); neu.disabled = rest > 0; neu.textContent = rest > 0 ? 'Neuer Code in ' + rest + ' s möglich' : 'Neuen Code anfordern'; if (rest > 0 && form.isConnected) setTimeout(tick, 1000); };
          tick();
          form.addEventListener('submit', (e) => { e.preventDefault(); ok.click(); });
          ok.addEventListener('click', async () => {
            const code = inp.value.replace(/\s/g, '');
            if (!/^\d{6,10}$/.test(code)) { f2.className = 'f e'; f2.textContent = 'Bitte gib den Code aus der E-Mail ein (nur Ziffern).'; inp.focus(); return; }
            ok.disabled = true; f2.className = 'f'; f2.textContent = 'Wird geprüft …';
            const r = await codePruefen(mail, code, gesendet).catch(() => ({ fehler: 'falsch' }));
            ok.disabled = false;
            if (r.ok) { f2.className = 'f g'; f2.textContent = 'Angemeldet.'; const ziel = o.bleiben ? null : null; setTimeout(() => zu(true), 300); return; }
            versuche++; f2.className = 'f e'; f2.textContent = (TEXT[r.fehler] || TEXT.falsch) + (versuche >= 4 && r.fehler === 'falsch' ? ' Tipp: Fordere lieber einen neuen Code an.' : ''); inp.select();
          });
          neu.addEventListener('click', async () => { neu.disabled = true; const r = await codeSenden(mail).catch(() => ({ fehler: 'senden' })); if (r.ok) { gesendet = r.gesendet; f2.className = 'f g'; f2.textContent = 'Neuer Code gesendet.'; versuche = 0; inp.value = ''; } else { f2.className = 'f e'; f2.textContent = r.fehler === 'warten' ? TEXT.warten(r.sek) : (TEXT[r.fehler] || TEXT.senden); } tick(); });
        }
        start();
      }, { label: 'Anmelden' });
    }

    // ---- Spielername und Avatar
    const FEHLER_NAME = { zu_kurz: 'Der Name braucht mindestens 3 Zeichen.', zu_lang: 'Der Name darf höchstens 20 Zeichen haben.', zeichen: 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen sowie . _ - (am Anfang und Ende nur Buchstaben oder Ziffern).', unzulaessig: 'Dieser Name ist nicht erlaubt. Bitte wähle einen anderen.', vergeben: 'Dieser Name ist schon vergeben.', zu_oft: 'Zu viele Änderungen. Bitte später noch einmal.', netz: 'Keine Verbindung. Bitte später noch einmal.', avatar: 'Bitte wähle ein Bild.', unbekannt: 'Das hat nicht geklappt. Bitte später noch einmal.' };
    function profil(o) {
      o = o || {};
      return dialog((box, zu) => {
        let av = S.profil ? S.profil.avatar : 'a1';
        const inp = el('input', { type: 'text', maxlength: '20', autocomplete: 'nickname', 'aria-label': 'Spielername', placeholder: 'Spielername', value: S.profil ? S.profil.name : '' });
        const fb = meldung(); const knoepfe = [];
        const grid = el('div', { class: 'av', role: 'group', 'aria-label': 'Bild wählen' });
        AVATARE.forEach((emo, i) => { const id = 'a' + (i + 1); const b = el('button', { type: 'button', 'aria-label': 'Bild ' + (i + 1), 'aria-pressed': String(av === id), text: emo, onclick: () => { av = id; knoepfe.forEach((x) => x.b.setAttribute('aria-pressed', String(x.id === av))); } }); knoepfe.push({ b, id }); grid.append(b); });
        const speichern = el('button', { class: 'btn ja', type: 'button', text: 'Speichern' });
        box.append(el('h2', { text: o.erst ? 'Wie heißt du im Spiel?' : 'Dein Profil' }), el('p', { text: 'Dein Spielername ist öffentlich sichtbar. Nimm bitte nicht deinen echten Namen. Deine E-Mail-Adresse bleibt privat.' }), inp, grid, fb, speichern);
        if (o.erst) box.append(el('button', { class: 'btn', type: 'button', text: 'Später', onclick: () => { ss.set('playsaal.profil.spaeter', '1'); zu(null); } }));
        let t; inp.addEventListener('input', () => { clearTimeout(t); fb.className = 'f'; fb.textContent = ''; const n = inp.value.trim(); if (n.length < 3) return; t = setTimeout(async () => { const r = await nameFrei(n); if (inp.value.trim() !== n) return; if (r.frei) { fb.className = 'f g'; fb.textContent = 'Name ist frei.'; } else { fb.className = 'f e'; fb.textContent = FEHLER_NAME[r.fehler] || ''; } }, 450); });
        speichern.addEventListener('click', async () => { speichern.disabled = true; const r = await profilSpeichern(inp.value, av); speichern.disabled = false; if (r && r.ok) { zu(true); toast('Profil gespeichert.'); } else { fb.className = 'f e'; fb.textContent = FEHLER_NAME[(r && r.fehler) || 'unbekannt'] || FEHLER_NAME.unbekannt; } });
        setTimeout(() => inp.focus(), 50);
      }, { label: 'Profil', ohneX: !!o.erst });
    }

    // ---- Lokalen Fortschritt ins Konto übernehmen
    function uebernahme(ids) {
      return dialog((box, zu) => {
        const wahl = {}; const liste = el('div', { class: 'liste' });
        ids.forEach((id) => { const g = spielInfo(id) || { name: id }; const b = beschreibe(id, snapshot(id) || {}); wahl[id] = true; const cb = el('input', { type: 'checkbox', checked: true, onchange: (e) => { wahl[id] = e.target.checked; } }); liste.append(el('label', { class: 'ck' }, cb, el('span', {}, el('b', { text: g.name }), el('br'), el('small', { text: b.text || 'Fortschritt auf diesem Gerät' })))); });
        const ja = el('button', { class: 'btn ja', type: 'button', text: 'In mein Konto übernehmen' });
        box.append(el('h2', { text: 'Fortschritt übernehmen?' }), el('p', { text: 'Auf diesem Gerät gibt es Spielstände, die noch nicht in deinem Konto sind. Mit der Übernahme sind sie auf allen Geräten da.' }), liste, ja, el('button', { class: 'btn', type: 'button', text: 'Nicht übernehmen', onclick: () => { ids.forEach(nichtUebernehmen); zu(false); } }));
        ja.addEventListener('click', async () => { ja.disabled = true; ja.textContent = 'Wird übernommen …'; for (const id of ids) { if (wahl[id]) await uebernehmen(id); else nichtUebernehmen(id); } zu(true); toast('Fortschritt übernommen.'); });
      }, { label: 'Fortschritt übernehmen', ohneX: true });
    }

    // ---- Konflikt: Gerät gegen Konto
    const zeit = (t) => { try { return t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'unbekannt'; } catch (e) { return ''; } };
    function konflikt(id, server) {
      const g = spielInfo(id) || { name: id }; const lk = snapshot(id) || {}; const lb = beschreibe(id, lk);
      const sk = serverKeys(server) || {}; const sb = beschreibe(id, sk);
      const lokalVoraus = lb.wert > Number(server && server.progress || sb.wert);
      return dialog((box, zu) => {
        const karteL = el('div', { class: 'karte' }, el('b', { text: 'Dieses Gerät' }), el('span', { text: lb.text || 'Fortschritt vorhanden' }), el('small', { text: 'Zuletzt gespielt: ' + zeit(Number((M.games[id] || {}).at) || Date.now()) }));
        const karteS = el('div', { class: 'karte' }, el('b', { text: 'Dein Konto' }), el('span', { text: (server && server.summary) || sb.text || 'Fortschritt vorhanden' }), el('small', { text: 'Gespeichert: ' + zeit(server && (server.client_saved_at || server.updated_at)) + (server && server.device ? ' · ' + server.device : '') }));
        const a = el('button', { class: 'btn' + (lokalVoraus ? ' ja' : ''), type: 'button', text: 'Stand von diesem Gerät behalten' });
        const b = el('button', { class: 'btn' + (!lokalVoraus ? ' ja' : ''), type: 'button', text: 'Stand aus dem Konto laden' });
        const fb = meldung();
        box.append(el('h2', { text: g.name + ': Welcher Stand gilt?' }), el('p', { text: 'Auf diesem Gerät und in deinem Konto gibt es unterschiedliche Stände. Es wird nichts überschrieben, bevor du wählst.' }), el('div', { class: 'vs' }, karteL, karteS), lokalVoraus ? a : b, lokalVoraus ? b : a, fb, el('button', { class: 'btn', type: 'button', text: 'Später entscheiden', onclick: () => zu(null) }));
        const los = async (wahl) => { a.disabled = b.disabled = true; const ok = await entscheidung(id, wahl, server); if (ok) zu(wahl); else { a.disabled = b.disabled = false; fb.className = 'f e'; fb.textContent = 'Das hat nicht geklappt. Bitte noch einmal versuchen.'; } };
        a.addEventListener('click', () => los('lokal')); b.addEventListener('click', () => los('konto'));
      }, { label: 'Spielstand wählen' });
    }

    // ---- Fehler melden
    function melden() {
      return dialog((box, zu) => {
        const ta = el('textarea', { maxlength: '1000', placeholder: 'Was ist passiert? Was hast du gerade gemacht?', 'aria-label': 'Beschreibung des Fehlers' });
        const tech = el('input', { type: 'checkbox', checked: true });
        const fb = meldung(); const senden = el('button', { class: 'btn ja', type: 'button', text: 'Fehler senden' });
        const zaehler = el('small', { text: '0 / 1000' }); ta.addEventListener('input', () => { zaehler.textContent = ta.value.length + ' / 1000'; });
        box.append(el('h2', { text: 'Fehler melden' }), el('p', { text: 'Dein Spiel läuft weiter, dein Fortschritt geht dabei nicht verloren.' }), ta, zaehler,
          el('label', { class: 'ck' }, tech, el('span', {}, 'Technische Angaben mitsenden', el('br'), el('small', { text: 'Bildschirmgröße, Touch ja/nein und Browser-Version. Sonst nichts.' }))),
          el('p', { class: 'klein', text: 'Gesendet werden dein Text, das Spiel und die Version. Keine E-Mail nötig. Bitte schreib keine persönlichen Daten hinein.' }), fb, senden);
        senden.addEventListener('click', async () => {
          const text = ta.value.trim();
          if (text.length < 3) { fb.className = 'f e'; fb.textContent = 'Bitte beschreibe den Fehler mit ein paar Worten.'; ta.focus(); return; }
          senden.disabled = true; fb.className = 'f'; fb.textContent = 'Wird gesendet …';
          const r = await fehlerMelden(text, tech.checked);
          if (r && r.ok) { box.replaceChildren(el('h2', { text: 'Danke!' }), el('p', { text: 'Deine Meldung ist angekommen. Wir schauen sie uns an.' }), el('button', { class: 'btn ja', type: 'button', text: 'Weiterspielen', onclick: () => zu(true) })); return; }
          senden.disabled = false; fb.className = 'f e';
          fb.textContent = r && r.fehler === 'zu_oft' ? 'Du hast gerade schon mehrere Meldungen geschickt. Bitte versuche es später noch einmal.' : r && r.fehler === 'netz' ? 'Keine Verbindung. Dein Text bleibt hier stehen. Bitte später noch einmal senden.' : r && r.fehler === 'zu_lang' ? 'Der Text ist zu lang (höchstens 1000 Zeichen).' : 'Das hat nicht geklappt. Bitte später noch einmal.';
        });
      }, { label: 'Fehler melden' });
    }

    // ---- Knopf und Speicherstatus auf Spielseiten
    function leiste() {
      montieren();
      // Ein schmaler Reiter am linken Rand (Mitte) statt schwebender Knöpfe über dem Spiel. Der Punkt zeigt den Speicherstatus.
      const tab = el('button', { type: 'button', class: 'tab', 'aria-label': 'PlaySaal-Menü', 'aria-expanded': 'false', title: 'Menü' }, el('i'));
      const menue = el('div', { class: 'menue', hidden: true });
      if (C.fehlermelden !== false && SLUG) menue.append(el('button', { type: 'button', 'aria-label': 'Fehler melden', title: 'Fehler melden', onclick: () => { zu(); melden(); } }, svg(ICON.flagge), el('span', { text: 'Fehler melden' })));
      const pill = el('button', { type: 'button', class: 'pill' });
      const zeigePill = () => {
        const st = S.sync;
        tab.dataset.s = S.user ? st : '';
        const a = S.anbieterCache; if (!S.user && (!HOST_OK || !a || !(a.email || a.google || a.apple))) { pill.hidden = true; return; }
        pill.hidden = false; pill.dataset.s = st; pill.textContent = SYNC_TEXT[st] || ''; pill.title = S.user ? 'Konto öffnen' : 'Anmelden, um Fortschritt zu sichern';
      };
      const zu = () => { menue.hidden = true; tab.setAttribute('aria-expanded', 'false'); };
      tab.addEventListener('click', () => { const auf = menue.hidden; menue.hidden = !auf; tab.setAttribute('aria-expanded', String(auf)); });
      pill.addEventListener('click', () => { zu(); if (S.user) location.href = '/konto'; else anmelden(); });
      document.addEventListener('pointerdown', (e) => { if (!menue.hidden && !e.composedPath().includes(menue) && !e.composedPath().includes(tab)) zu(); }, true);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menue.hidden) zu(); });
      menue.append(pill); wrap.append(tab, menue); zeigePill();
      if (HOST_OK && C.anmelden && (C.anmelden.email || C.anmelden.google || C.anmelden.apple)) anbieter().then(zeigePill);
      on('sync', zeigePill); on('auth', zeigePill);
      return tab;
    }
    return { anmelden, profil, uebernahme, konflikt, melden, toast, leiste, dialog, el };
  }

  // ---------------------------------------------------------------- API
  window.PlaySaal = {
    online: !!C.rangliste, // geprüfte Rangliste (SCHRÄGLAGE), Schalter in playsaal-config.js
    cfg: C, avatare: AVATARE,
    hatSitzung, on, client, anbieter, anmelden: (o) => ui().anmelden(o), abmelden, oauth,
    profil: async () => S.profil, profilBearbeiten: () => ui().profil({}), profilSpeichern, nameFrei,
    user: () => S.user, token: () => S.token, bereit: () => S.bereit, rpc: (n, a) => rpc(n, a, { token: S.token }),
    syncStatus: () => ({ zustand: S.sync, text: SYNC_TEXT[S.sync] || '' }), syncJetzt: syncAlleJetzt, syncText: SYNC_TEXT, unsynchronisiert,
    favoriten: () => S.favs, favorit, melden: () => ui().melden(),
    verknuepfen: async (provider) => { rueckwegMerken(); const c = await client(); const r = await c.auth.linkIdentity({ provider, options: { redirectTo: location.origin + '/konto' } }); return r.error ? { fehler: r.error.message } : { ok: true }; },
    identitaeten: async () => { const c = await client(); const r = await c.auth.getUserIdentities(); return r.error ? [] : r.data.identities; },
    trennen: async (identity) => { const c = await client(); const r = await c.auth.unlinkIdentity(identity); return r.error ? { fehler: r.error.message } : { ok: true }; },
    emailHinzufuegen: async (email) => { const c = await client(); const r = await c.auth.updateUser({ email }); return r.error ? { fehler: r.error.message } : { ok: true }; },
    emailBestaetigen: async (email, token) => { const c = await client(); const r = await c.auth.verifyOtp({ email, token, type: 'email_change' }); return r.error ? { fehler: r.error.message } : { ok: true }; },
    kontoLoeschen: async (lokalAuch) => {
      const r = await rpc('konto_loeschen', { p_bestaetigung: 'LÖSCHEN' }, { token: S.token });
      if (r.fehler || !r.daten || !r.daten.ok) return { fehler: true };
      if (lokalAuch) lokaleSyncDatenEntfernen();
      M = { uid: null, games: {}, skip: {} }; metaSpeichern();
      try { const c = await client(); await c.auth.signOut({ scope: 'local' }); } catch (e) {}
      ls.del('playsaal.auth'); await sitzungSetzen(null, 'SIGNED_OUT'); return { ok: true };
    },
    rueckweg: () => { const o = json(ls.get('playsaal.rueck'), null); ls.del('playsaal.rueck'); return o && Date.now() - Number(o.t) < 900000 && gueltigerRueckweg(o.p) ? o.p : null; },
    gueltigerRueckweg, testlauf, hostOk: HOST_OK
  };

  const start = () => {
    if (SPIEL_ID || SLUG) ui().leiste();
    init();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
