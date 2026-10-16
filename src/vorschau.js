// Small dependency-free indexed PNG renderer for BlockSaal share cards.
const W=1200,H=630;
const palette=[[17,18,26],[27,28,39],[38,40,55],[246,247,249],[255,210,28],[255,146,0],[105,136,244],[114,216,149],[196,133,239]];
const font={
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
 H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],
 K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],R:['11110','10001','10001','11110','10100','10010','10001'],
 S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
 U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','01010','01010','00100'],
 W:['10001','10001','10001','10101','10101','11011','10001'],
 Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10011','10101','10101','10101','11001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01111','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','11110'],
 '?':['01110','10001','00001','00010','00100','00000','00100'],'!':['00100','00100','00100','00100','00100','00000','00100'],
 ' ':['00000','00000','00000','00000','00000','00000','00000']
};
const enc=new TextEncoder();
function crc(data){let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;}
function be(n){return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
function chunk(type,data){const t=enc.encode(type),body=new Uint8Array(t.length+data.length);body.set(t);body.set(data,t.length);return Uint8Array.from([...be(data.length),...body,...be(crc(body))]);}
function deflate(raw){const parts=[0x78,0x01];let a=1,b=0;
  for(let pos=0;pos<raw.length;pos+=65535){const size=Math.min(65535,raw.length-pos);parts.push(pos+size===raw.length?1:0,size&255,size>>>8,(~size)&255,((~size)>>>8)&255);
    for(let i=pos;i<pos+size;i++){const v=raw[i];parts.push(v);a=(a+v)%65521;b=(b+a)%65521;}}
  parts.push(...be(((b<<16)|a)>>>0));return Uint8Array.from(parts);
}
function join(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
export function renderPreview(lines=null){
  const px=new Uint8Array(W*H);px.fill(0);
  function rect(x,y,w,h,color){for(let yy=Math.max(0,Math.floor(y));yy<Math.min(H,y+h);yy++)px.fill(color,yy*W+Math.max(0,Math.floor(x)),yy*W+Math.min(W,x+w));}
  function write(str,x,y,scale,color){let xx=x;for(const ch of str){const g=font[ch]||font[' '];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(g[row][col]==='1')rect(xx+col*scale,y+row*scale,scale,scale,color);xx+=6*scale;}}
  function center(str,y,scale,color){write(str,Math.round((W-(str.length*6-1)*scale)/2),y,scale,color);}
  rect(0,0,W,12,5);rect(45,42,1110,546,1);
  for(let i=0;i<9;i++){const x=72+i*118;rect(x,72,55,55,[6,7,8,4][i%4]);rect(x+60,131,55,55,[4,8,7,6][i%4]);}
  rect(72,215,1056,335,0);center('BLOCKSAAL',235,14,3);
  if(lines===null){center('WIE VIELE REIHEN?',365,8,4);}
  else{const num=String(lines),scale=num.length>3?15:18;center(num,350,scale,4);center(lines===1?'REIHE':'REIHEN',492,8,3);}
  center('SCHAFFST DU MEHR?',568,6,5);
  const raw=new Uint8Array(H*(W+1));for(let y=0;y<H;y++)raw.set(px.subarray(y*W,(y+1)*W),y*(W+1)+1);
  const plte=Uint8Array.from(palette.flat());
  return join([Uint8Array.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Uint8Array.from([...be(W),...be(H),8,3,0,0,0])),chunk('PLTE',plte),chunk('IDAT',deflate(raw)),chunk('IEND',new Uint8Array())]);
}

export function renderBauPreview(score=null){
  const px=new Uint8Array(W*H);px.fill(0);
  function rect(x,y,w,h,color){for(let yy=Math.max(0,Math.floor(y));yy<Math.min(H,y+h);yy++)px.fill(color,yy*W+Math.max(0,Math.floor(x)),yy*W+Math.min(W,x+w));}
  function write(str,x,y,scale,color){let xx=x;for(const ch of str){const g=font[ch]||font[' '];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(g[row][col]==='1')rect(xx+col*scale,y+row*scale,scale,scale,color);xx+=6*scale;}}
  function poly(points,color){const minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),maxY=Math.min(H,Math.ceil(Math.max(...points.map(p=>p[1]))));for(let y=minY;y<maxY;y++){const xs=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));}xs.sort((a,b)=>a-b);for(let i=0;i<xs.length;i+=2)rect(Math.floor(xs[i]),y,Math.ceil(xs[i+1]-xs[i]),1,color);}}
  rect(0,0,W,12,4);rect(45,42,1110,546,1);rect(72,68,1056,494,0);
  const p=(x,y,z)=>[310+(x-y)*34,260+(x+y)*17-z*33];
  poly([p(0,0,0),p(5,0,0),p(5,0,5),p(0,0,5)],2);poly([p(0,0,0),p(0,5,0),p(0,5,5),p(0,0,5)],1);
  for(let x=0;x<5;x++)for(let y=0;y<5;y++){const h=1+(x*3+y)%4;for(let z=0;z<h;z++){poly([p(x,y,z),p(x+1,y,z),p(x+1,y,z+1),p(x,y,z+1)],2);poly([p(x+1,y,z),p(x+1,y+1,z),p(x+1,y+1,z+1),p(x+1,y,z+1)],1);poly([p(x,y,z+1),p(x+1,y,z+1),p(x+1,y+1,z+1),p(x,y+1,z+1)],3);}}
  rect(100,85,15,360,5);rect(100,85,400,13,4);rect(388,98,3,62,3);rect(375,155,28,24,4);
  write('BAU',625,95,15,3);write('SAAL',625,215,15,4);
  write(score===null?'WIE VIEL PASST?':String(score)+' PUNKTE',590,365,score!==null&&score>999?6:5,3);
  write('SCHAFFST DU MEHR?',590,475,5,4);
  const raw=new Uint8Array(H*(W+1));for(let y=0;y<H;y++)raw.set(px.subarray(y*W,(y+1)*W),y*(W+1)+1);
  return join([Uint8Array.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Uint8Array.from([...be(W),...be(H),8,3,0,0,0])),chunk('PLTE',Uint8Array.from(palette.flat())),chunk('IDAT',deflate(raw)),chunk('IEND',new Uint8Array())]);
}
