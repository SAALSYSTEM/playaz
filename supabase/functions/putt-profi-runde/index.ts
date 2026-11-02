// Supabase Edge Function "putt-profi-runde" (Deno). Die Logik steht in handler.js (unter Node getestet).
// Deploy: npx supabase functions deploy putt-profi-runde --project-ref <ref> --no-verify-jwt (Sitzung prüft handler.js).
// logik.js, bahnen.js und teile.js sind Kopien aus public/spiele/putt-profi/ (node tools/edge-sync.mjs).
import { behandle } from './handler.js';

Deno.serve((req: Request) => behandle(req, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}));
