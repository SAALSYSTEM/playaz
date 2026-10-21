// Supabase Edge Function "schraeglage-lauf" (Deno). Die Logik steht in handler.js (unter Node getestet).
// Deploy: siehe docs/KONTEN.md (verify_jwt aus, die Sitzung wird in handler.js gegen Supabase geprüft).
// Die Dateien sim.js, levels.js, det.js, planck.js sind Kopien aus public/spiele/schraeglage/ (node tools/edge-sync.mjs).
import { behandle } from './handler.js';

Deno.serve((req: Request) => behandle(req, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}));
