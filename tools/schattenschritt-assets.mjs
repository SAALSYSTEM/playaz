// SCHATTENSCHRITT: zusätzliche KayKit-Modelle (CC0, Kay Lousberg) → public/spiele/schattenschritt/modelle/
// Schurke, Skelette und Grund-Animationen kommen aus /spiele/kerkerlauf/modelle/ und /spiele/letzte-bastion/modelle/ (gemeinsam genutzt).
// Hier nur: Schleich-Animationen und die Raum-Teile für das Raster (2 × 2 m je Feld). Quelle: design/kerkerlauf/kaykit/.
//
//   NODE_PATH=<ordner mit @gltf-transform/core, /functions> node tools/schattenschritt-assets.mjs
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, statSync } from 'node:fs';

const req = createRequire(join(process.env.NODE_PATH || '.', 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { prune, dedup, resample, mergeDocuments, unpartition } = req('@gltf-transform/functions');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'design/kerkerlauf/kaykit');
const OUT = join(root, 'public/spiele/schattenschritt/modelle');
mkdirSync(OUT, { recursive: true });
const io = new NodeIO();
const findeNode = (doc, name) => doc.getRoot().listNodes().find((n) => n.getName() === name);
const schreibe = async (name, doc) => { const f = join(OUT, name + '.glb'); await io.write(f, doc); console.log(name.padEnd(18), (statSync(f).size / 1024).toFixed(0).padStart(5), 'KB'); };

// Animationen: Schleichen, Ducken, Aufheben (gleiches Skelett Rig_Medium)
const CLIPS = { 'anim/Rig_Medium_MovementAdvanced.glb': ['Sneaking', 'Crouching'], 'anim/Rig_Medium_General.glb': ['PickUp'], 'anim/Rig_Medium_CombatMelee.glb': ['Melee_Dualwield_Attack_Stab'] };
{
  let doc = null;
  for (const [datei, clips] of Object.entries(CLIPS)) {
    const q = await io.read(join(SRC, datei));
    for (const a of q.getRoot().listAnimations()) if (!clips.includes(a.getName())) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((s) => s.dispose()); a.dispose(); }
    for (const n of q.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
    await q.transform(resample(), unpartition(), prune({ keepLeaves: true }));
    if (!doc) { doc = q; continue; }
    // Kanäle auf die Knochen der ersten Datei umhängen (gleiche Namen)
    const ziel = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
    for (const a of q.getRoot().listAnimations()) {
      const neu = doc.createAnimation(a.getName());
      for (const s of a.listSamplers()) {
        const ein = doc.createAccessor().setArray(s.getInput().getArray().slice()).setType(s.getInput().getType());
        const aus = doc.createAccessor().setArray(s.getOutput().getArray().slice()).setType(s.getOutput().getType());
        const ns = doc.createAnimationSampler().setInput(ein).setOutput(aus).setInterpolation(s.getInterpolation());
        neu.addSampler(ns);
        for (const c of a.listChannels().filter((c) => c.getSampler() === s)) {
          const knoten = ziel.get(c.getTargetNode().getName()); if (!knoten) continue;
          neu.addChannel(doc.createAnimationChannel().setTargetNode(knoten).setTargetPath(c.getTargetPath()).setSampler(ns));
        }
      }
    }
  }
  const puffer = doc.getRoot().listBuffers()[0];
  for (const a of doc.getRoot().listAccessors()) a.setBuffer(puffer);
  await doc.transform(unpartition(), prune({ keepLeaves: true }));
  await schreibe('anim-schleichen', doc);
}

// Raum-Teile als benannte Wurzelknoten, gemeinsame Textur
const RAUM = ['floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A', 'floor_foundation_allsides', 'box_large', 'barrel_large', 'crates_stacked',
  'wall_gated', 'key', 'coin', 'floor_tile_grate_open', 'wall', 'torch_mounted', 'banner_shield_red', 'banner_patternA_red', 'candle_triple', 'pillar'];
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
