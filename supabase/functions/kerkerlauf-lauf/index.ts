// Supabase Edge Function "kerkerlauf-lauf" (Deno). Die Logik steht in handler.js (unter Node getestet).
// Deploy: npx supabase functions deploy kerkerlauf-lauf --project-ref <ref> --no-verify-jwt (Sitzung prüft handler.js).
// logik.js ist eine Kopie aus public/spiele/kerkerlauf/ (node tools/edge-sync.mjs).
import { behandle } from './handler.js';

Deno.serve((req: Request) => behandle(req, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
}));
