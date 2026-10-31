// KERKERLAUF: KayKit-Pakete (CC0, Kay Lousberg) → schlanke GLB-Dateien für public/spiele/kerkerlauf/modelle/
// Quelle: design/kerkerlauf/kaykit/ (entpackte glTF-Ordner aus Adventurers 2.0, Skeletons 1.1,
// Character Animations 1.1 und Dungeon Pack 1.1, jeweils FREE).
//
//   NODE_PATH=<ordner mit @gltf-transform/core, /functions> node tools/kerkerlauf-assets.mjs
//   (z. B. in einem Temp-Ordner: npm i @gltf-transform/core@4 @gltf-transform/functions@4)
//
// Erzeugt:
//   held-<name>.glb    Held mit Waffe(n) an handslot.r / handslot.l (Skin + Textur, ohne Animation)
//   skelett-<name>.glb Gegner ebenso
//   anim-*.glb         nur die benötigten Clips, ohne Mannequin-Mesh (Knochen heißen bei allen Figuren gleich)
//   welt.glb           Kerker-Teile als benannte Wurzelknoten, eine gemeinsame Textur
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, statSync } from 'node:fs';

const req = createRequire(join(process.env.NODE_PATH || '.', 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { prune, dedup, resample, mergeDocuments, unpartition } = req('@gltf-transform/functions');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'design/kerkerlauf/kaykit');
const OUT = join(root, 'public/spiele/kerkerlauf/modelle');
mkdirSync(OUT, { recursive: true });
const io = new NodeIO();

const HELDEN = {
  ritter: ['adv/Characters/Knight.glb', { r: 'adv/Assets/sword_1handed.gltf', l: 'adv/Assets/shield_badge_color.gltf' }],
  barbar: ['adv/Characters/Barbarian.glb', { r: 'adv/Assets/axe_1handed.gltf', l: 'adv/Assets/shield_round_barbarian.gltf' }],
  schurke: ['adv/Characters/Rogue_Hooded.glb', { r: 'adv/Assets/dagger.gltf', l: 'adv/Assets/dagger.gltf' }],
  waldlaeufer: ['adv/Characters/Ranger.glb', { r: 'adv/Assets/dagger.gltf', l: 'adv/Assets/bow_withString.gltf' }],
  magier: ['adv/Characters/Mage.glb', { r: 'adv/Assets/staff.gltf' }],
};
const SKELETTE = {
  diener: ['skel/Characters/Skeleton_Minion.glb', { r: 'skel/Assets/Skeleton_Blade.gltf' }],
  krieger: ['skel/Characters/Skeleton_Warrior.glb', { r: 'skel/Assets/Skeleton_Axe.gltf', l: 'skel/Assets/Skeleton_Shield_Small_A.gltf' }],
};
const ANIM = {
  'anim-basis': ['anim/Rig_Medium_MovementBasic.glb', ['Running_A', 'Jump_Full_Short', 'Jump_Idle', 'Jump_Land']],
  'anim-allgemein': ['anim/Rig_Medium_General.glb', ['Idle_A', 'Death_A', 'Hit_A']],
  'anim-kampf': ['anim/Rig_Medium_CombatMelee.glb', ['Melee_1H_Attack_Slice_Horizontal', 'Melee_Dualwield_Attack_Slice', 'Melee_2H_Idle']],
  'anim-magie': ['anim/Rig_Medium_CombatRanged.glb', ['Ranged_Magic_Shoot']],
  'anim-extra': ['anim/Rig_Medium_MovementAdvanced.glb', ['Dodge_Left', 'Dodge_Right', 'Dodge_Forward']],
  'anim-skelett': ['anim/Rig_Medium_Special.glb', ['Skeletons_Idle', 'Skeletons_Taunt', 'Skeletons_Death', 'Skeletons_Awaken_Standing']],
  'anim-jubel': ['anim/Rig_Medium_Simulation.glb', ['Cheering']],
};
const WELT = ['floor_tile_large', 'floor_tile_big_spikes', 'wall', 'wall_arched', 'pillar', 'torch_mounted', 'banner_patternA_red', 'banner_patternC_blue', 'banner_thin_yellow',
  'barrel_large', 'box_large', 'crates_stacked', 'barrel_small_stack', 'coin', 'chest_gold', 'rubble_half', 'keg'];

const findeNode = (doc, name) => doc.getRoot().listNodes().find((n) => n.getName() === name);

async function figur(datei, waffen) {
  const doc = await io.read(join(SRC, datei));
  for (const [seite, w] of Object.entries(waffen)) {
    const quelle = await io.read(join(SRC, w));
    const vorher = new Set(doc.getRoot().listNodes());
    mergeDocuments(doc, quelle);
    const slot = findeNode(doc, 'handslot.' + seite);
    const neueSzene = doc.getRoot().listScenes().slice(-1)[0];
    for (const n of neueSzene.listChildren()) { if (vorher.has(n)) continue; neueSzene.removeChild(n); slot.addChild(n); }
    neueSzene.dispose();
  }
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]);
  await doc.transform(unpartition(), dedup(), prune());
  return doc;
}

const schreibe = async (name, doc) => { const f = join(OUT, name + '.glb'); await io.write(f, doc); console.log(name.padEnd(18), (statSync(f).size / 1024).toFixed(0).padStart(5), 'KB'); };

for (const [name, [datei, waffen]] of Object.entries(HELDEN)) await schreibe('held-' + name, await figur(datei, waffen));
for (const [name, [datei, waffen]] of Object.entries(SKELETTE)) await schreibe('skelett-' + name, await figur(datei, waffen));

for (const [name, [datei, clips]] of Object.entries(ANIM)) {
  const doc = await io.read(join(SRC, datei));
  // Animation samt Kanälen und Samplern entfernen, sonst bleiben deren Daten als Waisen in der Datei
  for (const a of doc.getRoot().listAnimations()) if (!clips.includes(a.getName())) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((s) => s.dispose()); a.dispose(); }
  for (const n of doc.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
  await doc.transform(resample(), unpartition(), prune({ keepLeaves: true }));
  await schreibe(name, doc);
}

{
  const doc = await io.read(join(SRC, 'dungeon', WELT[0] + '.gltf'));
  doc.getRoot().listScenes()[0].listChildren()[0].setName(WELT[0]);
  for (const teil of WELT.slice(1)) {
    const q = await io.read(join(SRC, 'dungeon', teil + '.gltf'));
    q.getRoot().listScenes()[0].listChildren().forEach((n, i) => n.setName(i ? teil + '_' + i : teil));
    mergeDocuments(doc, q);
    const szenen = doc.getRoot().listScenes(), haupt = szenen[0], neu = szenen.slice(-1)[0];
    for (const n of neu.listChildren()) { neu.removeChild(n); haupt.addChild(n); }
    neu.dispose();
  }
  await doc.transform(unpartition(), dedup(), prune());
  await schreibe('welt', doc);
}
