#!/usr/bin/env node
// Kanonische Adresse der Website an EINER Stelle umstellen (Cutover PlayAZ -> PlaySaal).
//
//   node tools/domain.mjs                         prüft: alle Seiten nutzen dieselbe Adresse, Sitemap aktuell
//   node tools/domain.mjs https://playsaal.com    stellt canonical, og:url, og/twitter-Bilder, JSON-LD,
//                                                 sitemap.xml, robots.txt um und schaltet den Umzug-Hinweis an
//   node tools/domain.mjs https://... --umzug-aus  wie oben, Umzug-Hinweis bleibt aus
//
// Share-Links in den Spielen lesen den canonical-Link, müssen also nicht angefasst werden.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const SPIELDATEIEN = readdirSync(join(PUB, 'spiele')).filter((f) => f.endsWith('.html')).sort();
const html = ['index.html', 'impressum.html', 'datenschutz.html', '404.html', 'umzug.html',
  ...SPIELDATEIEN.map((f) => 'spiele/' + f)];
// Seiten, die in die Sitemap gehören. Private/noindex-Prototypen bleiben direkt erreichbar, aber unsichtbar.
const SITEMAP = ['/', ...SPIELDATEIEN.filter((f) => !/<meta name="robots" content="[^"]*noindex/i.test(readFileSync(join(PUB, 'spiele', f), 'utf8')))
  .map((f) => '/spiele/' + f.replace(/\.html$/, '')), '/impressum', '/datenschutz'];

const read = (f) => readFileSync(join(PUB, f), 'utf8');
const canonicalOf = (s) => (s.match(/<link rel="canonical" href="(https:\/\/[^/"]+)/) || [])[1];

function aktuell() {
  const o = canonicalOf(read('index.html'));
  if (!o) throw new Error('Kein canonical in index.html');
  return o;
}
function sitemap(origin) {
  const urls = SITEMAP.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
const robots = (origin) => `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;

function pruefen() {
  const o = aktuell(); const fehler = [];
  for (const f of html) {
    const s = read(f);
    const fremd = [...s.matchAll(/(?:href|content)="(https:\/\/[^/"]+)\/[^"]*"/g)].map((m) => m[1])
      .filter((h) => h !== o && !/schema\.org|w3\.org/.test(h));
    if (fremd.length) fehler.push(`${f}: andere Adresse ${[...new Set(fremd)].join(', ')}`);
    const c = canonicalOf(s);
    if (c && c !== o) fehler.push(`${f}: canonical ${c}`);
  }
  if (read('sitemap.xml') !== sitemap(o)) fehler.push('sitemap.xml veraltet');
  if (read('robots.txt') !== robots(o)) fehler.push('robots.txt veraltet');
  const ld = read('index.html').match(/"url":"(https:\/\/[^/"]+)\//);
  if (!ld || ld[1] !== o) fehler.push('JSON-LD url passt nicht');
  return { origin: o, fehler };
}

const [, , ziel, opt] = process.argv;
if (!ziel) {
  const r = pruefen();
  console.log('Kanonische Adresse:', r.origin);
  if (r.fehler.length) { console.error(r.fehler.join('\n')); process.exit(1); }
  console.log('OK: alle Seiten, sitemap.xml und robots.txt konsistent.');
  process.exit(0);
}
if (!/^https:\/\/[a-z0-9.-]+$/.test(ziel)) { console.error('Adresse bitte als https://host ohne Pfad angeben.'); process.exit(2); }
const alt = aktuell();
const esc = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let n = 0;
for (const f of html) {
  const s = read(f);
  const neu = s.replace(new RegExp(`(href="|content="|"url":")${esc}(?=/)`, 'g'), (m, p) => { n++; return p + ziel; });
  if (neu !== s) writeFileSync(join(PUB, f), neu);
}
writeFileSync(join(PUB, 'sitemap.xml'), sitemap(ziel));
writeFileSync(join(PUB, 'robots.txt'), robots(ziel));
if (opt !== '--umzug-aus') {
  const cfgPath = join(PUB, 'assets', 'umzug-config.js');
  const cfg = readFileSync(cfgPath, 'utf8');
  if (!cfg.includes(`ziel: '${ziel}'`)) console.warn(`Achtung: umzug-config.js hat ein anderes Ziel als ${ziel}. Bitte prüfen.`);
  writeFileSync(cfgPath, cfg.replace(/^(\s*aktiv:\s*)false\b/m, '$1true'));
}
console.log(`${alt} -> ${ziel}: ${n} URLs ersetzt, sitemap.xml und robots.txt neu${opt === '--umzug-aus' ? '' : ', Umzug-Hinweis aktiv'}.`);
const r = pruefen();
if (r.fehler.length) { console.error(r.fehler.join('\n')); process.exit(1); }
