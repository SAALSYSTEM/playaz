// Konto-Seite: Profil, Anmeldearten verknüpfen/trennen, Spielstände, Favoriten, Abmelden, Konto löschen.
// Alle Texte aus der Datenbank/vom Anbieter werden nur per textContent eingesetzt.
(function () {
  'use strict';
  const PS = window.PlaySaal, C = window.PLAYSAAL_CFG;
  if (!PS || !C) return;
  const $ = (id) => document.getElementById(id);
  const NAMEN = { google: 'Google', apple: 'Apple', email: 'E-Mail' };
  const zeit = (t) => { try { return new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  const meld = (el, text, art) => { el.className = 'f' + (art ? ' ' + art : ''); el.textContent = text || ''; };
  const leeren = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
  const mk = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

  function profilZeigen() {
    PS.profil().then((p) => {
      $('spielername').textContent = p ? p.name : 'Noch kein Spielername';
      const n = p ? Number(String(p.avatar).slice(1)) - 1 : -1;
      $('avatar').textContent = PS.avatare[n] || '🙂';
      $('profilBearbeiten').textContent = p ? 'Name und Bild ändern' : 'Spielernamen wählen';
    });
  }
  function statusZeigen() {
    const s = PS.syncStatus(); const el = $('syncStatus'); el.dataset.s = s.zustand; el.textContent = s.text;
  }
  async function identitaetenZeigen() {
    const box = $('identitaeten'); leeren(box);
    let ids = [];
    try { ids = await PS.identitaeten(); } catch (e) {}
    ids.forEach((i) => {
      const z = mk('div', null, 'zeile'); const l = mk('div');
      l.append(mk('b', NAMEN[i.provider] || i.provider));
      const mail = i.identity_data && i.identity_data.email;
      const verborgen = mail && /privaterelay\.appleid\.com$/i.test(mail);
      if (i.provider === 'email' && mail) { l.append(document.createElement('br'), mk('small', mail)); }
      else if (verborgen) { l.append(document.createElement('br'), mk('small', 'E-Mail-Adresse verborgen')); }
      const b = mk('button', ids.length < 2 ? 'Einziger Weg' : 'Trennen', 'btn klein'); b.type = 'button';
      if (ids.length < 2) { b.disabled = true; b.title = 'Dein letzter Anmeldeweg ist geschützt.'; }
      else b.addEventListener('click', async () => {
        if (!confirm((NAMEN[i.provider] || i.provider) + ' als Anmeldeart trennen? Du kannst dich weiter mit deinen anderen Arten anmelden.')) return;
        b.disabled = true; const r = await PS.trennen(i);
        meld($('kontoMeldung'), r.ok ? 'Anmeldeart getrennt.' : 'Das hat nicht geklappt.', r.ok ? 'g' : 'e'); identitaetenZeigen();
      });
      z.append(l, b); box.append(z);
    });
    $('artHinweis').textContent = ids.length < 2 ? 'Dein letzter Anmeldeweg kann nicht entfernt werden. Füge erst einen weiteren hinzu.' : '';
    const vk = $('verknuepfen'); leeren(vk);
    const a = await PS.anbieter(); const haben = new Set(ids.map((i) => i.provider));
    ['google', 'apple'].forEach((p) => {
      if (!a[p] || haben.has(p)) return;
      const b = mk('button', NAMEN[p] + ' hinzufügen', 'btn klein'); b.type = 'button';
      b.addEventListener('click', async () => { b.disabled = true; const r = await PS.verknuepfen(p); if (!r.ok) { b.disabled = false; meld($('kontoMeldung'), 'Verknüpfen hat nicht geklappt. Bitte später noch einmal versuchen.', 'e'); } });
      vk.append(b);
    });
    if (a.email && !haben.has('email')) { const b = mk('button', 'E-Mail hinzufügen', 'btn klein'); b.type = 'button'; b.addEventListener('click', () => { $('mailBox').hidden = false; $('mailNeu').focus(); }); vk.append(b); }
  }
  let neueMail = '';
  $('mailSenden').addEventListener('click', async () => {
    const m = $('mailNeu').value.trim(); const f = $('mailMeldung');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(m)) { meld(f, 'Bitte gib eine gültige E-Mail-Adresse ein.', 'e'); return; }
    $('mailSenden').disabled = true; const r = await PS.emailHinzufuegen(m); $('mailSenden').disabled = false;
    if (r.ok) { neueMail = m; $('mailCodeZeile').hidden = false; meld(f, 'Code gesendet an ' + m + '.', 'g'); $('mailCode').focus(); } else meld(f, 'Der Code konnte nicht gesendet werden. Ist die Adresse schon bei einem anderen Konto in Verwendung?', 'e');
  });
  $('mailBestaetigen').addEventListener('click', async () => {
    const c = $('mailCode').value.replace(/\s/g, ''); const f = $('mailMeldung');
    if (!/^\d{6,10}$/.test(c)) { meld(f, 'Bitte gib den Code aus der E-Mail ein.', 'e'); return; }
    const r = await PS.emailBestaetigen(neueMail, c);
    if (r.ok) { meld(f, 'E-Mail hinzugefügt.', 'g'); $('mailBox').hidden = true; identitaetenZeigen(); } else meld(f, 'Der Code stimmt nicht oder ist abgelaufen.', 'e');
  });

  async function staendeZeigen() {
    const box = $('staende'); leeren(box);
    try {
      const c = await PS.client();
      const r = await c.from('saves').select('game_id,summary,device,updated_at,client_saved_at').order('updated_at', { ascending: false });
      if (r.error) throw r.error;
      const slugVon = Object.fromEntries(Object.entries(C.spiele).map(([s, i]) => [i, s]));
      if (!r.data.length) { box.append(mk('p', 'Noch keine Spielstände im Konto. Sobald du eingeloggt spielst, werden sie hier gesichert.', 'klein')); return; }
      r.data.forEach((s) => {
        const z = mk('div', null, 'zeile'); const l = mk('div'); const slug = slugVon[s.game_id];
        l.append(mk('b', (C.namen && C.namen[slug]) || s.game_id), document.createElement('br'), mk('small', (s.summary || 'Fortschritt gesichert') + ' · ' + zeit(s.client_saved_at || s.updated_at) + (s.device ? ' · ' + s.device : '')));
        z.append(l); if (slug) { const a = mk('a', 'Spielen', 'btn klein'); a.href = '/spiele/' + slug; z.append(a); } box.append(z);
      });
    } catch (e) { box.append(mk('p', 'Spielstände konnten nicht geladen werden. Spielen geht trotzdem weiter.', 'klein')); }
  }
  function favoritenZeigen() {
    const box = $('favoriten'); const f = [...PS.favoriten()];
    leeren(box);
    if (!f.length) { box.append(mk('p', 'Noch keine Favoriten. Tippe auf der Startseite bei einem Spiel auf das Herz.', 'klein')); return; }
    f.sort().forEach((slug) => { const z = mk('div', null, 'zeile'); z.append(mk('b', (C.namen && C.namen[slug]) || slug)); const a = mk('a', 'Spielen', 'btn klein'); a.href = '/spiele/' + encodeURIComponent(slug); z.append(a); box.append(z); });
  }

  $('anmelden').addEventListener('click', () => PS.anmelden());
  $('profilBearbeiten').addEventListener('click', () => PS.profilBearbeiten());
  $('syncJetzt').addEventListener('click', async () => { const b = $('syncJetzt'); b.disabled = true; await PS.syncJetzt(); b.disabled = false; staendeZeigen(); });
  $('abmelden').addEventListener('click', async () => {
    const b = $('abmelden'); b.disabled = true; meld($('kontoMeldung'), 'Wird abgemeldet …');
    let r = await PS.abmelden();
    if (r.offen) {
      const ok = confirm('Es gibt noch Fortschritt, der nicht im Konto gesichert ist. Wenn du jetzt abmeldest, wird er auf diesem Gerät entfernt. Trotzdem abmelden?');
      if (!ok) { b.disabled = false; meld($('kontoMeldung'), 'Abmelden abgebrochen. Dein Fortschritt bleibt erhalten.'); return; }
      r = await PS.abmelden({ erzwingen: true });
    }
    location.reload();
  });
  $('loeschen').addEventListener('click', () => {
    // Eigene, einfache Bestätigung (Eingabe von LÖSCHEN), unabhängig vom Spiel-Dialog
    const d = document.createElement('dialog'); d.setAttribute('aria-label', 'Konto löschen');
    d.style.cssText = 'background:#1a1b26;color:#f6f7f9;border:1px solid rgba(246,247,249,.2);border-radius:18px;padding:18px;max-width:min(440px,calc(100vw - 24px))';
    const h = mk('h2', 'Konto wirklich löschen?'); h.style.margin = '0 0 8px';
    const p = mk('p', 'Dein Profil, deine gesicherten Spielstände und Favoriten werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden. Tippe zur Bestätigung LÖSCHEN ein.');
    const inp = document.createElement('input'); inp.type = 'text'; inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'Zur Bestätigung LÖSCHEN eingeben');
    const lab = document.createElement('label'); lab.style.cssText = 'display:flex;gap:8px;margin:10px 0;align-items:flex-start'; const cb = document.createElement('input'); cb.type = 'checkbox'; lab.append(cb, mk('span', 'Auch die Spielstände auf diesem Gerät entfernen', 'klein'));
    const f = mk('p', '', 'f'); const row = mk('div', null, 'reihe');
    const ja = mk('button', 'Endgültig löschen', 'btn gefahr'); ja.type = 'button'; ja.disabled = true;
    const nein = mk('button', 'Abbrechen', 'btn'); nein.type = 'button';
    row.append(ja, nein); d.append(h, p, inp, lab, f, row); document.body.append(d); d.showModal();
    inp.addEventListener('input', () => { ja.disabled = inp.value.trim() !== 'LÖSCHEN'; });
    nein.addEventListener('click', () => { d.close(); d.remove(); });
    d.addEventListener('cancel', () => { setTimeout(() => d.remove(), 0); });
    ja.addEventListener('click', async () => {
      ja.disabled = true; meld(f, 'Wird gelöscht …');
      const r = await PS.kontoLoeschen(cb.checked);
      if (r.ok) { d.close(); d.remove(); location.href = '/'; } else { ja.disabled = false; meld(f, 'Löschen hat nicht geklappt. Bitte später noch einmal versuchen.', 'e'); }
    });
  });

  let gezeigt = false;
  function ansicht() {
    $('laden').hidden = true;
    const u = PS.user();
    $('gast').hidden = !!u; $('angemeldet').hidden = !u;
    if (!u) {
      PS.anbieter().then((a) => { $('gastHinweis').textContent = a.email || a.google || a.apple ? '' : 'Die Anmeldung ist noch nicht freigeschaltet. Bis dahin bleiben deine Spielstände auf diesem Gerät.'; $('anmelden').hidden = !(a.email || a.google || a.apple); });
      return;
    }
    if (!PS.cfg.siteUrl) return;
    const r = PS.rueckweg(); if (r) { location.replace(r); return; }
    profilZeigen(); statusZeigen(); identitaetenZeigen(); staendeZeigen(); favoritenZeigen(); gezeigt = true;
  }
  PS.on('auth', () => { gezeigt = false; ansicht(); });
  PS.on('profil', profilZeigen);
  PS.on('sync', statusZeigen);
  PS.on('synchronisiert', () => { if (gezeigt) staendeZeigen(); });
  PS.on('favoriten', () => { if (gezeigt) favoritenZeigen(); });
  PS.on('bereit', () => { if (!gezeigt) ansicht(); });
  if (PS.bereit()) ansicht();
})();
