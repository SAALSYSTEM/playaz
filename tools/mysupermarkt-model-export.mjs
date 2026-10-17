// Export the actual in-game instances for an offline geometry inspection.
// This does not launch a browser, exercise WebGL, or claim browser QA.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {createGame} from '../public/spiele/mysupermarkt/engine.js';
import {createView} from '../public/spiele/mysupermarkt/render.js';
const require=createRequire(import.meta.url),T=require('../public/assets/three.min.js');
let scene;
class CaptureRenderer{
  constructor(){this.shadowMap={};}
  setPixelRatio(){}setClearColor(){}setSize(){}dispose(){}
  render(s){scene=s;}
}
globalThis.THREE={...T,WebGLRenderer:CaptureRenderer};
const view=createView({getBoundingClientRect:()=>({width:400,height:500})},{inspection:true});
const state=createGame();state.player.x=0;state.player.z=0;
const frames=[];
for(const [title,angle,carry]of [['Vorne',0,0],['Seite',Math.PI/2,0],['Hinten',Math.PI,0],['Tragen',-.5,3]]){
  state.player.angle=angle;state.player.cargo.juice=carry;view.frame(state,.03);
  const meshes=[];
  for(const mesh of scene.children)if(mesh.isInstancedMesh&&mesh.count){
    const g=mesh.geometry,matrix=new T.Matrix4(),color=new T.Color(),instances=[];
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);mesh.getColorAt(i,color);instances.push({matrix:matrix.toArray(),color:[color.r,color.g,color.b]});}
    meshes.push({position:Array.from(g.attributes.position.array),normal:Array.from(g.attributes.normal.array),index:g.index?Array.from(g.index.array):null,instances});
  }
  frames.push({title,meshes});
}
writeFileSync(process.argv[2]||'/tmp/mysupermarkt-model.json',JSON.stringify(frames));view.dispose();
