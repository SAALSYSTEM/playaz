// LETZTE BASTION: zusätzliche KayKit-Modelle (CC0, Kay Lousberg) → public/spiele/letzte-bastion/modelle/
// Helden, Diener/Krieger-Skelette und die Grund-Animationen kommen aus public/spiele/kerkerlauf/modelle/ (gemeinsam genutzt,
// der Browser lädt sie nur einmal). Quelle wie dort: design/kerkerlauf/kaykit/.
//
//   NODE_PATH=<ordner mit @gltf-transform/core, /functions> node tools/bastion-assets.mjs
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, statSync } from 'node:fs';

const req = createRequire(join(process.env.NODE_PATH || '.', 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { prune, dedup, resample, mergeDocuments, unpartition } = req('@gltf-transform/functions');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'design/kerkerlauf/kaykit');
const OUT = join(root, 'public/spiele/letzte-bastion/modelle');
mkdirSync(OUT, { recursive: true });
const io = new NodeIO();
const findeNode = (doc, name) => doc.getRoot().listNodes().find((n) => n.getName() === name);
const schreibe = async (name, doc) => { const f = join(OUT, name + '.glb'); await io.write(f, doc); console.log(name.padEnd(18), (statSync(f).size / 1024).toFixed(0).padStart(5), 'KB'); };

async function figur(datei, waffen) {
  const doc = await io.read(join(SRC, datei));
  for (const [seite, w] of Object.entries(waffen)) {
    const quelle = await io.read(join(SRC, w));
    const vorher = new Set(doc.getRoot().listNodes());
    mergeDocuments(doc, quelle);
    const slot = findeNode(doc, 'handslot.' + seite), neu = doc.getRoot().listScenes().slice(-1)[0];
    for (const n of neu.listChildren()) { if (vorher.has(n)) continue; neu.removeChild(n); slot.addChild(n); }
    neu.dispose();
  }
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]);
  await doc.transform(unpartition(), dedup(), prune());
  return doc;
}
await schreibe('skelett-magier', await figur('skel/Characters/Skeleton_Mage.glb', { r: 'skel/Assets/Skeleton_Staff.gltf' }));
await schreibe('skelett-schurke', await figur('skel/Characters/Skeleton_Rogue.glb', { r: 'skel/Assets/Skeleton_Blade.gltf', l: 'skel/Assets/Skeleton_Blade.gltf' }));

// Animationen: nur die zusätzlich benötigten Clips, aus mehreren Dateien in eine (gleiches Skelett Rig_Medium)
const CLIPS = { 'anim/Rig_Medium_Special.glb': ['Skeletons_Walking', 'Skeletons_Awaken_Floor'], 'anim/Rig_Medium_CombatMelee.glb': ['Melee_1H_Attack_Chop', 'Melee_2H_Attack_Spin'], 'anim/Rig_Medium_General.glb': ['Hit_B'] };
for (const [datei, clips] of Object.entries(CLIPS)) {
  const doc = await io.read(join(SRC, datei));
  for (const a of doc.getRoot().listAnimations()) if (!clips.includes(a.getName())) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((s) => s.dispose()); a.dispose(); }
  for (const n of doc.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
  await doc.transform(resample(), unpartition(), prune({ keepLeaves: true }));
  await schreibe('anim-' + datei.split('_').pop().replace('.glb', '').toLowerCase(), doc);
}

// Raum: Teile als benannte Wurzelknoten, gemeinsame Textur
const RAUM = ['floor_tile_large', 'floor_tile_small_decorated', 'floor_tile_grate', 'wall', 'wall_corner', 'wall_doorway', 'wall_gated', 'pillar', 'torch_mounted',
  'banner_shield_red', 'banner_patternC_blue', 'candle_triple', 'barrel_small_stack', 'keg', 'crates_stacked', 'chest_gold', 'coin', 'rubble_half'];
{
  const doc = await io.read(join(SRC, 'dungeon', RAUM[0] + '.gltf'));
  doc.getRoot().listScenes()[0].listChildren()[0].setName(RAUM[0]);
  for (const teil of RAUM.slice(1)) {
    const q = await io.read(join(SRC, 'dungeon', teil + '.gltf'));
    q.getRoot().listScenes()[0].listChildren().forEach((n, i) => n.setName(i ? teil + '_' + i : teil));
    mergeDocuments(doc, q);
    const szenen = doc.getRoot().listScenes(), haupt = szenen[0], neu = szenen.slice(-1)[0];
    for (const n of neu.listChildren()) { neu.removeChild(n); haupt.addChild(n); }
    neu.dispose();
  }
  await doc.transform(unpartition(), dedup(), prune());
  await schreibe('raum', doc);
}
