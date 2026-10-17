// PlaySaal-Worker. Fast alles liefert Cloudflare direkt als statische Datei aus ./public (ohne diesen Code).
// Nur zwei Pfade laufen zuerst hier durch (siehe "run_worker_first" in wrangler.jsonc):
//   /spiele/blocksaal?c=42   dieselbe Spielseite, aber mit Link-Vorschau für die Herausforderung (Open Graph, ohne JavaScript lesbar)
//   /og/blocksaal/42.png     das Vorschaubild 1200 × 630 mit der Reihenzahl
// Alles andere reicht der Worker unverändert an die Static Assets weiter.
import Engine from '../public/spiele/blocksaal/engine.js';
import { renderVorschau, W, H } from './vorschau.js';

const SEITE = '/spiele/blocksaal';
const BILD = /^\/og\/blocksaal\/([1-9]\d{0,2})\.png$/;

// Absolute https-Adresse für og:url/og:image (Crawler brauchen sie absolut). Nur lokal bleibt es bei http.
const lokal = (host) => /^(localhost|127\.|\[::1\])/.test(host);
const herkunft = (url) => (lokal(url.hostname) ? url.origin : 'https://' + url.host);

function vorschauSeite(url, n, antwort) {
  const titel = Engine.previewTitle(n);
  const beschreibung = Engine.PREVIEW_DESCRIPTION;
  const ursprung = herkunft(url);
  const bild = `${ursprung}/og/blocksaal/${n}.png`;
  const alt = `${Engine.rowsText(n)} bei BlockSaal geschafft`;
  const setze = (wert) => ({ element(el) { el.setAttribute('content', wert); } });
  const out = new HTMLRewriter()
    .on('meta[property="og:title"]', setze(titel))
    .on('meta[property="og:description"]', setze(beschreibung))
    .on('meta[property="og:url"]', setze(`${ursprung}${SEITE}?c=${n}`))
    .on('meta[property="og:image"]', setze(bild))
    .on('meta[property="og:image:type"]', setze('image/png'))
    .on('meta[property="og:image:width"]', setze(String(W)))
    .on('meta[property="og:image:height"]', setze(String(H)))
    .on('meta[property="og:image:alt"]', setze(alt))
    .on('meta[name="twitter:title"]', setze(titel))
    .on('meta[name="twitter:description"]', setze(beschreibung))
    .on('meta[name="twitter:image"]', setze(bild))
    .transform(antwort);
  // <link rel="canonical"> bleibt absichtlich auf der normalen Spielseite (SEO: Herausforderungslinks sind keine eigenen Seiten)
  const headers = new Headers(out.headers);
  headers.delete('etag'); headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(out.body, { status: out.status, headers });
}

async function vorschauBild(request, ctx, n) {
  // Gleiche Zahl = gleiches Bild: einmal rechnen, danach aus dem Cache der Cloudflare-Rechenzentren
  const key = new Request(new URL(request.url).origin + `/og/blocksaal/${n}.png`);
  let cache = null;
  try { cache = caches.default; const hit = await cache.match(key); if (hit) return hit; } catch (e) { cache = null; }
  const res = new Response(await renderVorschau(n), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff'
    }
  });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const url = new URL(request.url);
      const bild = BILD.exec(url.pathname);
      if (bild) return vorschauBild(request, ctx, Number(bild[1]));
      if (url.pathname === SEITE) {
        const n = Engine.parseChallenge(url.search);
        if (n) {
          const antwort = await env.ASSETS.fetch(request);
          if (antwort.status === 200 && (antwort.headers.get('content-type') || '').includes('text/html')) return vorschauSeite(url, n, antwort);
          return antwort;
        }
      }
    }
    return env.ASSETS.fetch(request);
  }
};
