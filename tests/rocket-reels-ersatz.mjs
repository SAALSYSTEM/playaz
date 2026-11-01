// ROCKET REELS – Ersatz-Supabase für Tests (Auth + rpc rocket_laden/rocket_speichern mit denselben Revisionsregeln wie die Migration).
import assert from 'node:assert/strict';
export const UID = '11111111-2222-3333-4444-555555555555';
// Ersatz für Supabase: /auth/v1/user + rpc rocket_laden / rocket_speichern (gleiche Regeln wie die SQL-Funktionen)
export function ersatzSupabase() {
  const db = new Map(); const log = [];
  let vorSpeichern = null; // Hook für Konflikt-Tests
  const f = async (url, o = {}) => {
    const json = (status, d) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/auth/v1/user')) {
      const tok = (o.headers.authorization || '').replace('Bearer ', '');
      return tok === 'gut' ? json(200, { id: UID }) : tok === 'zwei' ? json(200, { id: '99999999-2222-3333-4444-555555555555' }) : json(401, {});
    }
    const name = url.split('/rpc/')[1]; const a = JSON.parse(o.body); log.push(name);
    assert.equal(o.headers.authorization, 'Bearer service', 'Datenbank nur mit service_role');
    if (name === 'rocket_laden') { const r = db.get(a.p_user); return json(200, r ? { zustand: structuredClone(r.zustand), revision: r.revision } : null); }
    if (name === 'rocket_speichern') {
      if (vorSpeichern) { const h = vorSpeichern; vorSpeichern = null; h(); }
      const r = db.get(a.p_user);
      if (a.p_basis === 0) { if (r) return json(200, { ok: false, grund: 'konflikt' }); db.set(a.p_user, { zustand: a.p_zustand, revision: 1 }); return json(200, { ok: true, revision: 1 }); }
      if (!r || r.revision !== a.p_basis) return json(200, { ok: false, grund: 'konflikt' });
      db.set(a.p_user, { zustand: a.p_zustand, revision: r.revision + 1 }); return json(200, { ok: true, revision: r.revision + 1 });
    }
    return json(404, {});
  };
  return { f, db, log, set vorSpeichern(h) { vorSpeichern = h; } };
}
