// Worker "playaz": liefert die Website aus public/ aus und hält Supabase wach.
// Kostenlose Supabase-Projekte pausieren nach 7 Tagen ohne Zugriff; der tägliche Ping verhindert das.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      console.log('Supabase nicht konfiguriert, kein Ping.');
      return;
    }
    const headers = { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (!env.SUPABASE_KEY.startsWith('sb_')) headers.Authorization = 'Bearer ' + env.SUPABASE_KEY;
    const res = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/wach', { method: 'POST', headers, body: '{}' });
    const text = await res.text();
    console.log('Supabase-Ping', res.status, text.slice(0, 80));
    if (!res.ok) throw new Error('Supabase-Ping fehlgeschlagen: ' + res.status);
  },
};
