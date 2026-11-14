// Supabase Edge Function "neon-coast-lauf" (Deno). Die Logik steht in handler.js (unter Node getestet).
// Deploy: npx supabase functions deploy neon-coast-lauf --project-ref <ref> --no-verify-jwt (Sitzung prüft handler.js).
// tagesnacht.js, engine.js, welt.js, daten.js, bilder.js und det.js sind Kopien aus public/spiele/neon-coast/ (node tools/edge-sync.mjs).
import { behandle } from './handler.js';

Deno.serve((req: Request) => behandle(req, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}));
