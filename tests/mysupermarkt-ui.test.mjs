// DOM wiring smoke test, not a browser/layout/touch acceptance test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createGame,serialize,hire,createOnlineOrder} from '../public/spiele/mysupermarkt/engine.js';
const require=createRequire(import.meta.url),T=require('../public/assets/three.min.js');
const ctx=new Proxy({}, {get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):key==='measureText'?s=>({width:s.length*20}):()=>{},set:()=>true});
class Node{
  constructor(id){this.id=id;this.tagName='DIV';this.hidden=false;this.textContent='';this.innerHTML='';this.style={};this.dataset={};this.listeners={};this.options=[{}];this.classList={toggle(){},add(){},remove(){}};this.firstElementChild={style:{}};}
  addEventListener(name,fn){this.listeners[name]=fn;}setAttribute(){}focus(){document.activeElement=this;}getContext(){return ctx;}
  getBoundingClientRect(){return {width:390,height:844};}setPointerCapture(){}append(){}click(){}querySelectorAll(){return [];}get offsetParent(){return this.hidden?null:{};}
}
class FakeRenderer{constructor(){this.shadowMap={};this.info={render:{},memory:{}};}setPixelRatio(){}setClearColor(){}setSize(){}render(){}dispose(){}}
const html=readFileSync(new URL('../public/spiele/mysupermarkt.html',import.meta.url),'utf8'),nodes=new Map();
for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],new Node(m[1]));
for(const id of ['fatal','modal','joystick','context','toast'])nodes.get(id).hidden=true;
for(const id of ['shareCanvas','importFile','importStatus'])nodes.set(id,new Node(id));
const docEvents={},winEvents={},values=new Map();let frame;
globalThis.THREE={...T,WebGLRenderer:FakeRenderer};
globalThis.document={getElementById:id=>nodes.get(id),createElement:id=>new Node(id),querySelector:()=>({href:'https://playsaal.com/spiele/mysupermarkt'}),addEventListener:(name,fn)=>{docEvents[name]=fn;},activeElement:{tagName:'BODY'},documentElement:{},hidden:false};
globalThis.window={addEventListener:(name,fn)=>{winEvents[name]=fn;}};
globalThis.location={href:'https://playsaal.com/spiele/mysupermarkt'};
globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
globalThis.requestAnimationFrame=fn=>{frame=fn;};

test('Spiel-Bootstrap, Menüs, Pause, Pointer-Abbruch und Speichern sind verdrahtet',async()=>{
  await import('../public/spiele/mysupermarkt/game.js');
  assert.equal(nodes.get('fatal').hidden,true);assert.equal(typeof frame,'function');
  nodes.get('start').onclick();assert.equal(nodes.get('welcome').hidden,true);
  for(let i=0;i<30;i++)frame(performance.now()+i*34);
  const canvas=nodes.get('world');
  canvas.listeners.pointerdown({pointerId:1,clientX:100,clientY:300,preventDefault(){}});
  canvas.listeners.pointermove({pointerId:1,clientX:145,clientY:310,preventDefault(){}});
  assert.equal(nodes.get('joystick').hidden,false);
  canvas.listeners.pointercancel({pointerId:1});assert.equal(nodes.get('joystick').hidden,true);
  for(const name of ['supply','build','staff','overview','orders','milestones','awards','share','pause']){
    docEvents.click({target:{closest:()=>({dataset:{open:name}})}});
    assert.equal(nodes.get('modal').hidden,false);assert.ok(nodes.get('modalBody').innerHTML.length>30);
    assert.doesNotMatch(nodes.get('modalBody').innerHTML,/NaN|undefined/);
    nodes.get('closeModal').onclick();assert.equal(nodes.get('modal').hidden,true);
  }
  assert.ok(values.has('mysupermarkt.v1'));assert.ok(values.has('mysupermarkt.v1.backup'));
  winEvents.blur();assert.equal(nodes.get('modal').hidden,false);
});
test('Später Speicherstand: alle Menüs mit Mitarbeitern und Online-Aufträgen',async()=>{
  const s=createGame();s.upgrades.online=1;s.upgrades.floor=1;s.upgrades.shipping=1;s.milestone=17;
  s.cash+=10000;s.finance.initial+=10000;for(const role of ['cashier','stocker','loader','packer'])hire(s,role);createOnlineOrder(s,{juice:3});
  values.set('mysupermarkt.v1',serialize(s));
  await import('../public/spiele/mysupermarkt/game.js?late-state');nodes.get('start').onclick();
  for(const name of ['supply','build','staff','overview','orders','milestones','awards','share','pause']){
    docEvents.click({target:{closest:()=>({dataset:{open:name}})}});assert.doesNotMatch(nodes.get('modalBody').innerHTML,/NaN|undefined/);nodes.get('closeModal').onclick();
  }
});
