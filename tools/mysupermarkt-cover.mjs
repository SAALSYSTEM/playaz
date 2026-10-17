// Resize the approved generated illustration; the SVG is the old draft.
// Requires sharp in local node_modules, or CODEX_PRIMARY_RUNTIME_NODE_MODULES.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const require=createRequire(import.meta.url),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let sharp;try{sharp=require('sharp');}catch(e){if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw e;sharp=require(resolve(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'));}
await sharp(resolve(root,'tools/art/mysupermarkt-cover.png')).resize(1200,630,{fit:'cover'}).png({compressionLevel:9}).toFile(resolve(root,'public/bilder/mysupermarkt.png'));
await sharp(resolve(root,'tools/art/mysupermarkt-cover.png')).resize(960,504,{fit:'cover'}).webp({quality:85}).toFile(resolve(root,'public/bilder/mysupermarkt.webp'));
console.log('MySupermarkt: 1200 × 630 Cover erzeugt.');
