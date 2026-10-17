// Structural scene tests with the real vendored Three.js and a renderer stub.
// These do NOT exercise WebGL, CSS layout, touch devices or GPU performance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGame,buyShelf,buyUpgrade} from '../public/spiele/mysupermarkt/engine.js';
import {PRODUCTS} from '../public/spiele/mysupermarkt/data.js';
import {createView} from '../public/spiele/mysupermarkt/render.js';
import {drawShare} from '../public/spiele/mysupermarkt/share.js';
import {drawCharacter} from '../public/spiele/mysupermarkt/characters.js';
const require=createRequire(import.meta.url),T=require('../public/assets/three.min.js');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let captured=null;
class FakeRenderer{
  constructor(){this.shadowMap={};this.info={render:{calls:0},memory:{geometries:0}};}
  setPixelRatio(){}setClearColor(){}setSize(){}dispose(){}
  render(scene,camera){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);captured={scene,camera};this.info.render.calls=scene.children.filter(c=>c.visible&&(c.isInstancedMesh?c.count>0:c.isSprite)).length;}
}
const ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):key==='measureText'?s=>({width:s.length*20}):()=>{},set:()=>true});
globalThis.THREE={...T,WebGLRenderer:FakeRenderer};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};

for(const [width,height] of [[375,812],[390,844],[768,1024],[1440,900]]){
  test(`Three.js-Szenenaufbau und Kameraprojektion ${width} × ${height} (kein Browsertest)`,()=>{
    const canvas={getBoundingClientRect:()=>({width,height})},view=createView(canvas),s=createGame();
    for(let i=0;i<60;i++)view.frame(s,1/30);
    const p=view.project(s.player.x,s.player.z);assert.ok(p.x>0&&p.x<width&&p.y>0&&p.y<height,JSON.stringify(p));
    s.milestone=19;s.finance.initial+=100000;s.cash+=100000;
    for(const id of ['warehouse','floor','checkout','online','shipping','warehouseXL','cart'])buyUpgrade(s,id);
    for(const p of PRODUCTS.slice(1))buyShelf(s,p.id);
    for(const r of s.shelves)r.stock=12; // render-only fixture, intentionally not an economy save
    for(let n=0;n<24;n++)s.customers.push({...s.player,id:'c'+n,x:4+(n%4)*4,z:4+Math.floor(n/4)*2,cargo:{...s.player.cargo},state:n%2?'queue':'shopping',wait:40,color:n%6});
    view.frame(s,.03);
    assert.ok(captured.scene.children.some(o=>o.isInstancedMesh));
    let instanceCount=0;const matrix=new T.Matrix4();
    for(const o of captured.scene.children)if(o.isInstancedMesh){instanceCount+=o.count;assert.ok(o.count<=1024);for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));}}
    assert.ok(instanceCount>500);assert.ok(view.info().calls<180,`Structural render objects: ${view.info().calls}`);
    const before=captured.scene.children.length;for(let n=0;n<100;n++){s.customers.forEach(c=>c.id+='x');view.frame(s,.03);}assert.ok(captured.scene.children.length<=before+2,'No accumulating NPC labels');
    view.dispose();
  });
}
test('Teilengrafik nutzt gemeinsamen PlaySaal-Awardzeichner und 1200 × 630',()=>{
  const canvas={getContext:()=>ctx};drawShare(canvas,createGame());assert.equal(canvas.width,1200);assert.equal(canvas.height,630);
});
test('HTML/Module/SEO/Startseite: neue Verweise existieren, keine Fremd-CDNs',()=>{
  const file=resolve(root,'public/spiele/mysupermarkt.html'),html=readFileSync(file,'utf8');
  for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
    const path=m[1];if(path.startsWith('http')||path==='../')continue;assert.ok(existsSync(resolve(dirname(file),path)),path);
  }
  const game=readFileSync(resolve(root,'public/spiele/mysupermarkt/game.js'),'utf8');
  const dynamic=new Set(['shareCanvas','importFile','importStatus']);
  for(const m of game.matchAll(/\$\('([^']+)'\)/g))assert.ok(dynamic.has(m[1])||html.includes(`id="${m[1]}"`),m[1]);
  assert.ok(html.includes('viewport-fit=cover'));assert.ok(html.includes('og:site_name" content="PlaySaal'));
  assert.doesNotMatch(html,/<script[^>]+src="https?:/);
  assert.ok(readFileSync(resolve(root,'public/index.html'),'utf8').includes('data-slug="mysupermarkt"'));
  assert.ok(readFileSync(resolve(root,'public/assets/umzug.js'),'utf8').includes("prefix: 'mysupermarkt.'"));
  assert.ok(existsSync(resolve(root,'public/bilder/mysupermarkt.png')));
});

test('360°: jedes Körperteil und getragene Kartons drehen um denselben Ursprung',()=>{
  const view=createView({getBoundingClientRect:()=>({width:390,height:480})},{inspection:true}),s=createGame();
  s.player.x=0;s.player.z=0;s.player.cargo.juice=3;
  const matrices=()=>{const list=[];for(const m of captured.scene.children)if(m.name.startsWith('dynamic/')&&m.count)for(let i=0;i<m.count;i++){const mat=new T.Matrix4();m.getMatrixAt(i,mat);list.push(mat);}return list;};
  view.frame(s,.016);const front=matrices();assert.ok(front.length>90);
  for(const angle of [Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2]){
    s.player.angle=angle;view.frame(s,.016);const turned=matrices(),rotation=new T.Matrix4().makeRotationY(angle);
    assert.equal(turned.length,front.length);
    for(let i=0;i<front.length;i++){
      const expected=rotation.clone().multiply(front[i]);
      for(let n=0;n<16;n++)assert.ok(Math.abs(expected.elements[n]-turned[i].elements[n])<1e-5,`Part ${i}, angle ${angle}, entry ${n}`);
    }
  }
  assert.equal(captured.scene.children.filter(m=>m.isSprite).length,0,'No billboard faces or pre-rendered character images');view.dispose();
});

test('Viele detaillierte Figuren: Instanzseiten verlieren keine Körperteile',()=>{
  const view=createView({getBoundingClientRect:()=>({width:390,height:844})}),s=createGame();
  const total=()=>captured.scene.children.filter(m=>m.isInstancedMesh).reduce((n,m)=>n+m.count,0);
  view.frame(s,.016);const baseline=total();let expected=0;
  for(let i=0;i<24;i++){
    const actor={...s.player,id:'detailed'+i,color:i%6,x:4+(i%4)*2,z:3+Math.floor(i/4)*2,state:'shopping',cargo:{...s.player.cargo}};
    s.customers.push(actor);drawCharacter(()=>expected++,actor,{time:s.time});
  }
  view.frame(s,.016);assert.equal(total()-baseline,expected);
  const paged=captured.scene.children.filter(m=>m.name.startsWith('dynamic/portrait/'));
  assert.ok(paged.length>=2,'More than 1024 face/limb/hair instances use additional pages');
  assert.ok(paged.every(m=>m.count<=1024&&m.instanceColor));
  assert.ok(view.info().calls<80,'Instanced colours bound the draw-object count');view.dispose();
});

test('Laufen und Tragen verwenden unterschiedliche echte Arm- und Beinposen',()=>{
  const a=createGame().player,collect=options=>{const parts=[];drawCharacter((...args)=>parts.push(args),a,options);return parts;};
  const idle=collect({time:.1}),walking=collect({time:.1,moving:true}),carry=collect({time:.1,moving:true,carrying:true});
  assert.notDeepEqual(idle,walking);assert.notDeepEqual(walking,carry);
  for(const pose of [idle,walking,carry])for(const p of pose){assert.ok(p.slice(2).every(Number.isFinite));assert.ok(p.slice(5,8).every(n=>n>0));}
});
