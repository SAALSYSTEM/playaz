// Supabase Edge Function "ausfahrt-lauf" (Deno). Die Logik steht in handler.js (unter Node getestet).
// Deploy: siehe docs/AUSFAHRT_FREI.md (verify_jwt aus, die Sitzung wird in handler.js gegen Supabase geprüft).
// sim.js und raetsel.js sind Kopien aus public/spiele/ausfahrt-frei/ (node tools/edge-sync.mjs).
import { behandle } from './handler.js';

Deno.serve((req: Request) => behandle(req, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}));
