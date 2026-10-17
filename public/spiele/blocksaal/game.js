/* BLOCKSAAL – Oberfläche: Zeichnen, Steuerung, Ton, Bestwert, Teilen.
   Die Spielregeln stehen in engine.js. */
(function () {
  'use strict';
  const E = window.BlockEngine;
  const $ = (id) => document.getElementById(id);
  const COLS = E.COLS, ROWS = E.ROWS;
  const KEY_SAVE = 'blocksaal.v1', KEY_MUTE = 'blocksaal.muted';
  const nf = new Intl.NumberFormat('de-DE');

  // ---------- Speicher (localStorage kann im Privatmodus fehlen) ----------
  const int = (v) => Math.max(0, Math.min(1e9, Math.floor(Number(v) || 0)));
  function loadBest() {
    try { const d = JSON.parse(localStorage.getItem(KEY_SAVE)); return { score: int(d && d.score), lines: int(d && d.lines) }; }
    catch (e) { return { score: 0, lines: 0 }; }
  }
  function saveBest(b) { try { localStorage.setItem(KEY_SAVE, JSON.stringify(b)); } catch (e) { /* ohne Speicher spielt es sich genauso */ } }

  // ---------- Zustand ----------
  const game = new E.Game();
  let mode = 'idle';                       // idle | playing | paused | over
  let best = loadBest();
  const challenge = E.parseChallenge(location.search);
  let goalReached = false;
  let result = null;                       // Ergebnis der letzten Runde (fürs Teilen)
  let overTimer = 0;

  // ---------- Ton ----------
  let ac = null, muted = false;
  try { muted = JSON.parse(localStorage.getItem(KEY_MUTE)) === true; } catch (e) { muted = false; }
  function unlockAudio() {
    if (muted) return;
    try {
      if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
      if (ac && ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (muted || !ac) return;
    try {
      const t0 = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* Ton ist nie wichtig genug für einen Fehler */ }
  }
  const SFX = {
    move: () => tone(200, 0.03, 'square', 0.018),
    rotate: () => tone(380, 0.05, 'square', 0.03, 0, 520),
    hard: () => tone(150, 0.12, 'triangle', 0.09, 0, 60),
    lock: () => tone(110, 0.07, 'triangle', 0.06),
    clear: (n) => { for (let i = 0; i < Math.min(4, n) + 1; i++) tone(440 * Math.pow(1.26, i), 0.12, 'square', 0.05, i * 0.07); },
    level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.08)); },
    win: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, i * 0.09)); },
    over: () => { [330, 262, 196, 131].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.05, i * 0.16)); },
    start: () => { tone(330, 0.08, 'square', 0.04); tone(494, 0.1, 'square', 0.04, 0.08); }
  };
  const sfx = (name, arg) => { if (!muted && SFX[name]) SFX[name](arg); };

  // ---------- Zeichnen ----------
  const wrap = $('boardwrap'), cv = $('board'), ctx = cv.getContext('2d');
  const nx = $('next'), nctx = nx.getContext('2d');
  let cell = 20, dpr = 1;
  const sprites = new Map();
  const colorOf = (v) => E.COLORS[v - 1];

  function shade(hex, f) {   // f > 0 heller, f < 0 dunkler
    const n = parseInt(hex.slice(1), 16);
    const ch = (s) => { const c = (n >> s) & 255; return Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)); };
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // Ein Stein: dunkler Rand, Farbfläche mit Verlauf, helle obere Kante
  function sprite(v, s) {
    const k = v + ':' + s;
    let c = sprites.get(k);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'), col = colorOf(v);
    const b = Math.max(1, Math.round(s * 0.08)), r = Math.max(2, s * 0.16);
    g.fillStyle = shade(col, -0.55); roundRect(g, 0, 0, s, s, r); g.fill();
    const grad = g.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, shade(col, 0.28)); grad.addColorStop(1, shade(col, -0.12));
    g.fillStyle = grad; roundRect(g, b, b, s - 2 * b, s - 2 * b, Math.max(1, r - b)); g.fill();
    g.fillStyle = 'rgba(255,255,255,.34)'; g.fillRect(b * 2, b, s - 4 * b, Math.max(1, Math.round(b * 0.8)));
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(b * 2, s - b - Math.max(1, Math.round(b * 0.8)), s - 4 * b, Math.max(1, Math.round(b * 0.8)));
    sprites.set(k, c);
    return c;
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const css = Math.max(8, Math.floor(Math.min((w - 4) / COLS, (h - 4) / ROWS)));
    cell = Math.max(8, Math.floor(css * dpr));
    cv.width = cell * COLS; cv.height = cell * ROWS;
    cv.style.width = (cell * COLS / dpr) + 'px'; cv.style.height = (cell * ROWS / dpr) + 'px';
    nx.width = Math.round(64 * dpr); nx.height = Math.round(40 * dpr);
    sprites.clear(); hud.next = '';
  }

  function draw() {
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(246,247,249,.05)';
    for (let x = 1; x < COLS; x++) ctx.fillRect(x * cell, 0, 1, H);
    for (let y = 1; y < ROWS; y++) ctx.fillRect(0, y * cell, W, 1);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = game.board[y][x];
      if (v) ctx.drawImage(sprite(v, cell), x * cell, y * cell);
    }
    if (game.clearing) {   // volle Reihen blitzen kurz auf
      const k = 1 - Math.max(0, game.clearing.t) / E.CLEAR_MS;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.55 * Math.abs(Math.cos(k * Math.PI * 2))).toFixed(2) + ')';
      for (const y of game.clearing.rows) ctx.fillRect(0, y * cell, W, cell);
    }
    const p = game.piece;
    if (p && mode !== 'idle') {
      const d = game.ghostDistance();
      if (d > 0) {   // Schatten: zeigt, wo das Teil landen würde
        ctx.strokeStyle = colorOf(E.TYPES.indexOf(p.t) + 1); ctx.globalAlpha = 0.55;
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.08));
        const o = ctx.lineWidth / 2 + 1;
        for (const [gx, gy] of game.cells(p, p.r, p.x, p.y + d)) if (gy >= 0) ctx.strokeRect(gx * cell + o, gy * cell + o, cell - 2 * o, cell - 2 * o);
        ctx.globalAlpha = 1;
      }
      const sp = sprite(E.TYPES.indexOf(p.t) + 1, cell);
      for (const [gx, gy] of game.cells(p)) if (gy >= 0) ctx.drawImage(sp, gx * cell, gy * cell);
    }
  }

  function drawNext() {
    nctx.clearRect(0, 0, nx.width, nx.height);
    const t = game.nextType, shape = E.SHAPES[t][0];
    const s = Math.floor(14 * dpr);
    const xs = shape.map((c) => c[0]), ys = shape.map((c) => c[1]);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * s, h = (Math.max(...ys) - Math.min(...ys) + 1) * s;
    const ox = Math.round((nx.width - w) / 2) - Math.min(...xs) * s, oy = Math.round((nx.height - h) / 2) - Math.min(...ys) * s;
    const sp = sprite(E.TYPES.indexOf(t) + 1, s);
    for (const [cx, cy] of shape) nctx.drawImage(sp, ox + cx * s, oy + cy * s);
  }

  // ---------- Anzeigen ----------
  const hud = { score: -1, lines: -1, level: -1, best: -1, next: '' };
  const vScore = $('vScore'), vLines = $('vLines'), vLevel = $('vLevel'), vBest = $('vBest');
  function setNum(el, text) { el.textContent = text; el.classList.toggle('long', text.length > 6); }
  function updateHud() {
    if (hud.score !== game.score) { hud.score = game.score; setNum(vScore, nf.format(game.score)); }
    if (hud.lines !== game.lines) {
      hud.lines = game.lines; setNum(vLines, nf.format(game.lines));
      if (challenge) { const done = game.lines > challenge; $('boxGoal').classList.toggle('done', done); $('vGoal').textContent = done ? '✓ ' + (challenge + 1) + '+' : '> ' + challenge; }
    }
    if (hud.level !== game.level) { hud.level = game.level; setNum(vLevel, String(game.level)); }
    const b = Math.max(best.score, game.score);
    if (hud.best !== b) { hud.best = b; setNum(vBest, nf.format(b)); }
    if (hud.next !== game.nextType) { hud.next = game.nextType; drawNext(); }
  }
  function toast(text) {
    const old = wrap.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; wrap.appendChild(t);
    setTimeout(() => t.remove(), 1600);
    $('live').textContent = text;
  }

  // ---------- Overlays ----------
  const ov = { start: $('startOv'), pause: $('pauseOv'), over: $('overOv') };
  function showOnly(name, focusId) {
    for (const k in ov) ov[k].hidden = k !== name;
    if (name && focusId) { const b = $(focusId); if (b) b.focus({ preventScroll: true }); }
    if (!name && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  function startGame() {
    clearTimeout(overTimer);
    game.reset(); goalReached = false; result = null;
    hud.score = hud.lines = hud.level = hud.best = -1; hud.next = '';
    $('shareMsg').textContent = ''; $('shareField').hidden = true; $('shareLabel').textContent = 'Freunde herausfordern'; $('btnShare').disabled = false;
    mode = 'playing'; showOnly(null); unlockAudio(); sfx('start');
  }
  function pause(restartAsk) {
    if (mode !== 'playing') return;
    mode = 'paused'; stopHolds();
    $('pauseTitle').textContent = restartAsk ? 'Neu starten?' : 'Pause';
    $('pauseText').textContent = restartAsk ? 'Das aktuelle Spiel wird abgebrochen.' : 'Das Spiel ist angehalten.';
    $('btnResume').textContent = restartAsk ? 'Weiterspielen' : 'Weiter';
    showOnly('pause', 'btnResume');
  }
  function resume() { if (mode !== 'paused') return; mode = 'playing'; showOnly(null); }
  function askRestart() {
    if (mode === 'playing') pause(true);
    else if (mode === 'paused' || mode === 'idle') startGame();
    else if (mode === 'over') startGame();
  }

  function resultLine() {
    const n = result.lines;
    if (!challenge) return '';
    if (n > challenge) return '<strong>Geschafft!</strong> ' + E.rowsText(n) + ' sind mehr als die ' + challenge + ' deines Freundes.';
    if (n === challenge) return '<strong>Gleichstand!</strong> Genau ' + E.rowsText(challenge) + ', eine mehr hätte gereicht.';
    return '<strong>Knapp daneben.</strong> Noch ' + E.rowsText(challenge + 1 - n) + ', dann hast du die ' + challenge + ' geschlagen.';
  }
  function finishGame() {
    mode = 'over'; stopHolds();
    const prev = best;
    result = { score: game.score, lines: game.lines, level: game.level, newBest: game.score > prev.score && game.score > 0 };
    best = { score: Math.max(prev.score, game.score), lines: Math.max(prev.lines, game.lines) };
    saveBest(best);
    $('oLines').textContent = nf.format(result.lines); $('oScore').textContent = nf.format(result.score);
    $('oLevel').textContent = String(result.level); $('oBest').textContent = nf.format(best.score);
    $('stamp').hidden = !result.newBest;
    const line = resultLine(), r = $('oResult');
    r.hidden = !line; r.innerHTML = line;
    sfx('over');
    // Kurz das Endbild zeigen, dann das Ergebnis
    overTimer = setTimeout(() => { if (mode === 'over') showOnly('over', 'btnShare'); }, 650);
  }

  // ---------- Ereignisse aus der Engine ----------
  function handleEvents() {
    for (const e of game.drainEvents()) {
      if (e.type === 'move') sfx('move');
      else if (e.type === 'rotate') sfx('rotate');
      else if (e.type === 'hard') sfx('hard');
      else if (e.type === 'lock') sfx('lock');
      else if (e.type === 'clear') sfx('clear', e.count);
      else if (e.type === 'level') { toast('Stufe ' + e.level); sfx('level'); }
    }
    if (challenge && !goalReached && game.lines > challenge) { goalReached = true; toast('Herausforderung geschafft!'); sfx('win'); }
  }

  // ---------- Schleife ----------
  let last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(100, t - (last || t)); last = t;
    if (mode === 'playing') {
      game.update(dt); handleEvents();
      if (game.over) finishGame();
    }
    draw(); updateHud();
  }

  // ---------- Steuerung ----------
  const act = {
    left: () => game.move(-1), right: () => game.move(1), rotate: () => game.rotate(1), rotateBack: () => game.rotate(-1),
    down: () => game.softDrop(), drop: () => { game.hardDrop(); }
  };
  const timers = new Set();
  function stopHolds() {
    timers.forEach((t) => { clearTimeout(t.a); clearInterval(t.b); });
    timers.clear();
    document.querySelectorAll('.ctl.is-down').forEach((b) => b.classList.remove('is-down'));
  }
  // Halten wiederholt links/rechts (erst nach kurzer Pause, dann zügig)
  function startRepeat(fn, first, every) {
    const t = { a: 0, b: 0 };
    t.a = setTimeout(() => { t.b = setInterval(() => { if (mode === 'playing') fn(); }, every); }, first);
    timers.add(t);
    return () => { clearTimeout(t.a); clearInterval(t.b); timers.delete(t); };
  }
  function bindButton(id, name, repeat) {
    const btn = $(id);
    let stop = null, pid = null;
    const end = () => { if (stop) stop(); stop = null; pid = null; btn.classList.remove('is-down'); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pid !== null) return;
      pid = e.pointerId; btn.classList.add('is-down');
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ältere Browser */ }
      unlockAudio();
      if (mode === 'playing') act[name]();
      if (repeat) stop = startRepeat(act[name], 170, 55);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, end));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    // Tastatur-Bedienung der Knöpfe (Tab + Enter): ein Klick ohne Zeiger hat detail 0
    btn.addEventListener('click', (e) => { if (e.detail === 0 && mode === 'playing') act[name](); });
  }
  bindButton('cLeft', 'left', true);
  bindButton('cRight', 'right', true);
  bindButton('cRotate', 'rotate', false);
  bindButton('cDrop', 'drop', false);

  const KEYMAP = {
    ArrowLeft: ['left', true], ArrowRight: ['right', true], ArrowDown: ['down', true],
    ArrowUp: ['rotate', false], KeyX: ['rotate', false], KeyZ: ['rotateBack', false], Space: ['drop', false]
  };
  const heldKeys = new Map();
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    unlockAudio();
    if (e.code === 'KeyM') { setMuted(!muted); return; }
    if (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Pause') {
      if (mode === 'playing') pause(false); else if (mode === 'paused') resume();
      e.preventDefault(); return;
    }
    if (mode === 'playing') {
      const m = KEYMAP[e.code];
      if (!m) return;
      e.preventDefault();
      if (e.repeat || heldKeys.has(e.code)) return;
      act[m[0]]();
      if (m[1]) heldKeys.set(e.code, startRepeat(act[m[0]], m[0] === 'down' ? 120 : 170, m[0] === 'down' ? 45 : 55));
      return;
    }
    // Start und Spielende: Enter/Leertaste, wenn kein Knopf den Fokus hat (sonst löst der Knopf selbst aus)
    if ((e.code === 'Enter' || e.code === 'Space') && (mode === 'idle' || mode === 'over') && (!document.activeElement || document.activeElement === document.body)) {
      e.preventDefault(); startGame();
    }
  });
  document.addEventListener('keyup', (e) => {
    const stop = heldKeys.get(e.code);
    if (stop) { stop(); heldKeys.delete(e.code); }
    if (e.code === 'Space' && mode === 'playing') e.preventDefault();
  });
  window.addEventListener('blur', () => { heldKeys.forEach((s) => s()); heldKeys.clear(); stopHolds(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopHolds(); if (mode === 'playing') pause(false); } });

  $('btnStart').addEventListener('click', () => { unlockAudio(); startGame(); });
  $('btnAgain').addEventListener('click', () => { unlockAudio(); startGame(); });
  $('btnPause').addEventListener('click', () => { if (mode === 'playing') pause(false); else if (mode === 'paused') resume(); });
  $('btnRestart').addEventListener('click', askRestart);
  $('btnResume').addEventListener('click', resume);
  $('btnNew').addEventListener('click', () => { unlockAudio(); startGame(); });

  // ---------- Ton an/aus ----------
  function setMuted(m, leise) {
    muted = m;
    try { localStorage.setItem(KEY_MUTE, JSON.stringify(m)); } catch (e) { /* egal */ }
    const b = $('btnMute');
    b.setAttribute('aria-pressed', String(m)); b.setAttribute('aria-label', m ? 'Ton einschalten' : 'Ton ausschalten');
    $('icoOn').hidden = m; $('icoOff').hidden = !m;
    if (!m && !leise) { unlockAudio(); tone(520, 0.06, 'square', 0.04); }   // Bestätigungston nur nach Klick, nie beim Laden
  }
  $('btnMute').addEventListener('click', () => setMuted(!muted));
  setMuted(muted, true);

  // ---------- Teilen ----------
  const canonical = ((document.querySelector('link[rel=canonical]') || {}).href || (location.origin + location.pathname)).split('#')[0].split('?')[0];
  const isPhone = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function say(text) { $('shareMsg').textContent = text; }
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* weiter mit Ersatzweg */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;-webkit-user-select:text;user-select:text';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy'); ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  async function shareResult() {
    if (!result) return;
    const url = E.challengeUrl(canonical, result.lines), text = E.shareText(result.lines, url);
    const btn = $('btnShare');
    btn.disabled = true;
    try {
      if (typeof navigator.share === 'function' && isPhone() && !(navigator.canShare && !navigator.canShare({ text }))) {
        try {
          await navigator.share({ title: 'BlockSaal', text });
          say('Geteilt. Mal sehen, ob dich jemand schlägt!');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') { say(''); return; }   // Teilen-Fenster geschlossen
          // anderer Fehler: weiter mit Zwischenablage
        }
      }
      if (await copyText(text)) {
        $('shareField').hidden = true;
        $('shareLabel').textContent = '✓ Kopiert';
        say('✓ Text und Link sind kopiert. Jetzt in WhatsApp & Co. einfügen.');
        setTimeout(() => { $('shareLabel').textContent = 'Freunde herausfordern'; }, 3000);
      } else {
        const f = $('shareField');
        f.value = text; f.hidden = false; f.focus(); f.select();
        say('Kopieren hat nicht geklappt. Der Text ist markiert, bitte selbst kopieren.');
      }
    } finally { btn.disabled = false; }
  }
  $('btnShare').addEventListener('click', shareResult);

  // ---------- Herausforderung aus dem Link ----------
  if (challenge) {
    $('challengeBox').hidden = false;
    $('challengeText').textContent = 'Schaffst du mehr als ' + E.rowsText(challenge) + '?';
    $('boxGoal').hidden = false; $('vGoal').textContent = '> ' + challenge;
    $('btnStart').textContent = 'Herausforderung annehmen';
  }
  if (window.matchMedia && !window.matchMedia('(hover:hover) and (pointer:fine) and (min-width:700px)').matches) {
    $('startHint').textContent = 'Steuerung mit den vier großen Knöpfen unten. Kein Konto, keine Werbung.';
  }

  // ---------- Start ----------
  layout();
  if (window.ResizeObserver) new ResizeObserver(layout).observe(wrap);
  window.addEventListener('resize', layout);
  requestAnimationFrame(frame);
  $('btnStart').focus({ preventScroll: true });

  // Test-Haken (nur mit ?test in der Adresse): erlaubt den Browser-Tests, Zustand zu lesen und Spielstände aufzubauen
  if (/[?&]test(&|$)/.test(location.search)) {
    window.__bs = { game, finish: finishGame, get mode() { return mode; }, get best() { return best; }, get result() { return result; } };
  }
})();
