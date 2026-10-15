// SCHRÄGLAGE: Anbindung an die geplante PlaySaal-Infrastruktur (Supabase-Konten, Ranglisten).
// Nutzt window.PlaySaal aus /assets/playsaal.js (Branch "rangliste"), sobald es eingebunden ist.
// Ohne PlaySaal-Konto bleibt alles lokal: Spielen, Bestzeiten, Awards und Teilen funktionieren vollständig.
//
// Offizielle Zeiten: Der Browser schickt nur die Eingabefolge (Gas/Bremse je Takt). Der Prüfdienst
// (Cloudflare Worker, siehe docs/SCHRAEGLAGE.md) fährt den Lauf mit sim.js nach und trägt nur bestätigte
// Zeiten ein. Eine vom Browser behauptete Zeit wird nie übernommen.

const ENDPOINT = '/api/schraeglage/lauf';

export function createOnline() {
  const ps = () => (typeof window !== 'undefined' ? window.PlaySaal : null);
  const angemeldet = () => { const p = ps(); return !!(p && p.online && p.hatSitzung && p.hatSitzung()); };

  async function token() {
    const p = ps();
    const c = await p.client();
    const r = await c.auth.getSession();
    return r && r.data && r.data.session ? r.data.session.access_token : null;
  }

  return {
    verfuegbar() { const p = ps(); return !!(p && p.online); },
    angemeldet,

    async spielername() {
      const p = ps();
      if (!angemeldet() || !p.profil) return '';
      const pr = await p.profil();
      return (pr && pr.name) || '';
    },

    // run = { v, level, ms, inputs, vehicle }
    async meldeLauf(run) {
      const p = ps();
      if (!p || !p.online) return { status: 'lokal' };
      if (!angemeldet()) return { status: 'gast' };
      try {
        const t = await token();
        if (!t) return { status: 'gast' };
        const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: JSON.stringify(run) });
        if (r.status === 404) return { status: 'lokal' };          // Prüfdienst noch nicht eingerichtet
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.verifiziert) return { status: 'verifiziert', platz: j.platz_monat || null };
        if (r.ok) return { status: 'abgelehnt', grund: j.grund || '' };
        return { status: 'fehler' };
      } catch (e) {
        return { status: 'fehler' };
      }
    },

    // Rangliste (Monat/Jahr) je Level; Freunde-Rangliste, sobald es eine Freundschaftsfunktion gibt
    async zeigeRangliste(box, levels) {
      const p = ps();
      box.textContent = '';
      const tabs = document.createElement('div'); tabs.className = 'tabs';
      const sel = document.createElement('select');
      sel.style.cssText = 'height:40px;border-radius:999px;border:1px solid rgba(246,247,249,.14);background:#1a1b26;color:#f6f7f9;padding:0 12px;font:600 15px inherit';
      for (const l of levels) { const o = document.createElement('option'); o.value = l.id; o.textContent = 'Level ' + l.id; sel.appendChild(o); }
      const liste = document.createElement('ol'); liste.style.cssText = 'max-width:720px;margin:0 auto 18px;padding-left:28px';
      let zeitraum = 'monat';
      const laden = async () => {
        liste.textContent = 'Lädt …';
        try {
          const rows = await p.rpc('schraeglage_rangliste', { p_level: +sel.value, p_zeitraum: zeitraum, p_anzahl: 50 });
          liste.textContent = '';
          if (!rows || !rows.length) { liste.textContent = 'Noch keine verifizierten Zeiten.'; return; }
          for (const r of rows) {
            const li = document.createElement('li'); li.value = r.platz;
            li.textContent = r.name + ' – ' + (r.ms / 1000).toFixed(2).replace('.', ',') + ' s' + (r.ich ? ' (du)' : '');
            if (r.ich) li.style.color = '#FF9200';
            liste.appendChild(li);
          }
        } catch (e) { liste.textContent = 'Rangliste gerade nicht erreichbar.'; }
      };
      for (const [id, name] of [['monat', 'Monat'], ['jahr', 'Jahr']]) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.setAttribute('aria-pressed', String(id === zeitraum));
        b.addEventListener('click', () => { zeitraum = id; tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); laden(); });
        tabs.appendChild(b);
      }
      tabs.appendChild(sel);
      sel.addEventListener('change', laden);
      box.append(tabs, liste);
      laden();
    }
  };
}
