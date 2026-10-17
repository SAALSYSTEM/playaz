import {createView} from './render.js';
import {createGame} from './engine.js';

const $=id=>document.getElementById(id),canvas=$('model'),state=createGame();
let view,angle=0,spin=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=0,pointer=null,raf=0;
const basePlayer={...state.player,x:0,z:0};
function setSpin(value){spin=value;$('spin').setAttribute('aria-pressed',String(spin));$('spin').textContent=spin?'Drehung an':'Drehung aus';}
function setAngle(value){angle=(value%360+360)%360;$('angle').value=String(Math.floor(angle));$('angleValue').textContent=Math.floor(angle)+'°';}
function select(){
  const name=$('character').value,pose=$('pose').value;
  state.player={...basePlayer,cargo:{...basePlayer.cargo},role:null};
  if(name.startsWith('customer')){state.player.id=name;state.player.color=name==='customer3'?3:4;}
  else if(name!=='player'){state.player.id=name;state.player.role=name;state.player.active=true;}
  state.theme=Number($('theme').value);state.upgrades.cart=pose==='cart'&&name==='player'?1:0;
  state.player.status=['walk','carry','cart'].includes(pose)?'Unterwegs':'Bereit';
  state.player.action=pose==='work'?'preview':'';
  if(['carry','cart'].includes(pose))state.player.cargo.juice=3;
}
function release(){const id=pointer;pointer=null;if(id!==null&&canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}
function frame(now){
  const dt=last?Math.min((now-last)/1000,.05):0;last=now;state.time+=dt;
  if(spin)setAngle(angle+dt*22);state.player.angle=angle*Math.PI/180;
  view.frame(state,dt);raf=requestAnimationFrame(frame);
}
try{
  view=createView(canvas,{inspection:true});select();setSpin(spin);
  for(const id of ['character','pose','theme'])$(id).addEventListener('change',select);
  $('spin').addEventListener('click',()=>setSpin(!spin));
  $('angle').addEventListener('input',e=>{setSpin(false);setAngle(Number(e.target.value));});
  document.querySelectorAll('[data-angle]').forEach(b=>b.addEventListener('click',()=>{setSpin(false);setAngle(Number(b.dataset.angle));}));
  let x=0;
  canvas.addEventListener('pointerdown',e=>{if(pointer!==null)return;pointer=e.pointerId;x=e.clientX;setSpin(false);canvas.setPointerCapture(pointer);});
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;setAngle(angle+(e.clientX-x)*.65);x=e.clientX;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release);
  window.addEventListener('resize',()=>view.resize());window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{release();cancelAnimationFrame(raf);last=0;if(!document.hidden)raf=requestAnimationFrame(frame);});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);$('error').hidden=false;$('error').textContent='Die 3D-Verbindung wurde unterbrochen. Bitte lade die Ansicht neu.';});
  raf=requestAnimationFrame(frame);
}catch(e){$('error').hidden=false;$('error').textContent='Die 3D-Ansicht konnte nicht starten: '+e.message;}
