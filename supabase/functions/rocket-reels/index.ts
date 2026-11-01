// Supabase Edge Function "rocket-reels" (Deno). Die Logik steht in handler.js (unter Node getestet).
// Deploy: siehe docs/ROCKET_REELS.md (verify_jwt aus, die Sitzung wird in handler.js gegen Supabase geprüft).
// engine.js, roulette.js und poker.js sind Kopien aus public/spiele/rocket-reels/, roulette/ und texas-holdem/ (node tools/edge-sync.mjs).
import { behandle } from './handler.js';

Deno.serve((req: Request) => behandle(req, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}));
