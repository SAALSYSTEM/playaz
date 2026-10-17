// Small dependency-free indexed PNG renderer for BlockSaal share cards.
const W=1200,H=630;
const palette=[[17,18,26],[27,28,39],[38,40,55],[246,247,249],[255,210,28],[255,146,0],[105,136,244],[114,216,149],[196,133,239]];
const font={
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
 G:['01111','10000','10000','10111','10001','10001','01111'],
 H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],
 K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],R:['11110','10001','10001','11110','10100','10010','10001'],
 P:['11110','10001','10001','11110','10000','10000','10000'],
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

export function renderSebiPreview(level=null,stars=0){
  const px=new Uint8Array(W*H);px.fill(0);
  function rect(x,y,w,h,color){for(let yy=Math.max(0,Math.floor(y));yy<Math.min(H,y+h);yy++)px.fill(color,yy*W+Math.max(0,Math.floor(x)),yy*W+Math.min(W,x+w));}
  function write(str,x,y,scale,color){let xx=x;for(const ch of str){const g=font[ch]||font[' '];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(g[row][col]==='1')rect(xx+col*scale,y+row*scale,scale,scale,color);xx+=6*scale;}}
  function center(str,y,scale,color){write(str,Math.round((W-(str.length*6-1)*scale)/2),y,scale,color);}
  // A narrow vertical escape route with rising water at the bottom.
  rect(0,0,W,H,7);rect(86,0,1028,H,8);rect(108,0,22,H,1);rect(1070,0,22,H,1);
  rect(155,455,330,35,2);rect(155,455,330,12,5);
  rect(670,350,315,35,2);rect(670,350,315,12,5);
  rect(255,245,300,35,2);rect(255,245,300,12,5);
  rect(725,145,240,35,2);rect(725,145,240,12,5);
  for(let i=0;i<4;i++){rect(460+i*58,393,26,35,4);rect(467+i*58,399,6,21,3);}
  // Sebi jumps upward between platforms.
  rect(548,342,54,68,4);rect(558,310,42,38,3);rect(553,301,55,14,1);rect(562,410,16,40,1);rect(590,410,16,40,1);rect(598,357,26,12,4);
  // Animated-looking flood line and water mass.
  rect(0,505,W,125,6);for(let x=0;x<W;x+=80)rect(x,493+(x/80%2)*8,80,20,6);
  center('SPRUNGSEBI',44,14,3);
  if(level===null){center('DAS WASSER STEIGT!',105,7,4);center('WIE HOCH KOMMST DU?',185,7,3);}
  else{center('BIS LEVEL '+String(level)+' GEFLUECHTET',105,8,4);center(String(stars)+' VON 90 STERNEN',190,7,3);center('KOMMST DU HOEHER?',275,7,4);}
  const raw=new Uint8Array(H*(W+1));for(let y=0;y<H;y++)raw.set(px.subarray(y*W,(y+1)*W),y*(W+1)+1);
  return join([Uint8Array.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Uint8Array.from([...be(W),...be(H),8,3,0,0,0])),chunk('PLTE',Uint8Array.from(palette.flat())),chunk('IDAT',deflate(raw)),chunk('IEND',new Uint8Array())]);
}


/** Social sharing card for Kristallrausch. Native indexed PNG, no external fonts or CDN. */
export function renderKristallPreview(){
  const pal=[...palette,[39,213,222],[184,255,255],[125,83,58],[156,110,74],[70,87,105],[17,48,68],[255,230,113],[59,149,175],[31,40,53]];
  const px=new Uint8Array(W*H);px.fill(0);
  function rect(x,y,w,h,color){
    const x0=Math.max(0,Math.floor(x)),x1=Math.min(W,Math.ceil(x+w));
    for(let yy=Math.max(0,Math.floor(y));yy<Math.min(H,Math.ceil(y+h));yy++)px.fill(color,yy*W+x0,yy*W+x1);
  }
  function poly(points,color){
    const min=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))));
    const max=Math.min(H,Math.ceil(Math.max(...points.map(p=>p[1]))));
    for(let y=min;y<max;y++){
      const xs=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]));
      }
      xs.sort((a,b)=>a-b);
      for(let i=0;i+1<xs.length;i+=2)rect(xs[i],y,xs[i+1]-xs[i],1,color);
    }
  }
  function write(str,x,y,scale,color){
    let xx=x;
    for(const ch of str){
      const glyph=font[ch]||font[' '];
      for(let row=0;row<7;row++)for(let col=0;col<5;col++)
        if(glyph[row][col]==='1')rect(xx+col*scale,y+row*scale,scale,scale,color);
      xx+=6*scale;
    }
  }
  function center(str,y,scale,color){
    write(str,Math.round((W-(str.length*6-1)*scale)/2),y,scale,color);
  }
  function gem(x,y,size){
    poly([[x,y-size],[x+size*.7,y-size*.2],[x+size*.5,y+size],[x,y+size*1.3],[x-size*.6,y+size*.4],[x-size*.7,y-size*.2]],9);
    poly([[x,y-size],[x+size*.7,y-size*.2],[x,y+size*.18],[x-size*.7,y-size*.2]],10);
    poly([[x,y+size*.18],[x+size*.5,y+size],[x,y+size*1.3]],15);
    rect(x-size*.15,y-size*.64,size*.3,size*.2,3);
  }
  function rock(x,y,size){
    poly([[x-size,y-size*.2],[x-size*.65,y-size*.9],[x+size*.35,y-size],[x+size,y-size*.3],[x+size*.95,y+size*.72],[x-size*.65,y+size]],13);
    poly([[x-size,y-size*.2],[x-size*.65,y-size*.9],[x+size*.35,y-size],[x+size*.05,y-size*.15]],2);
    rect(x-size*.55,y-size*.52,size*.4,size*.15,10);
  }
  // Brand colors, illuminated cave and pixel-cut rock formations.
  rect(0,0,1200,630,0);
  rect(0,0,1200,12,5);
  rect(0,260,1200,370,14);
  for(let y=268;y<572;y+=56)for(let x=22;x<1200;x+=58){
    const r=(x*17+y*13)%17;
    if(r>7){rect(x,y,54,52,r>12?11:12);rect(x,y,54,6,12);rect(x+8,y+23,5,5,3);}
    else if(r<3){rect(x,y,55,53,13);rect(x+5,y+5,45,6,2);}
  }
  rect(45,275,1110,280,14);
  // Decorative cave platforms, crystals and boulders.
  for(let x=70;x<=1100;x+=64){
    if(x<395||x>845){rect(x,475,58,54,11);rect(x,475,58,8,12);}
  }
  for(let y=325;y<475;y+=60){
    for(const x of [90,154,1000,1064]){
      rect(x,y,58,54,11);rect(x,y,58,7,12);
    }
  }
  gem(290,399,48);gem(875,380,53);gem(740,484,33);gem(185,472,28);
  rock(388,448,45);rock(967,489,38);
  // Explorer wearing yellow mining helmet; kept distinct from retro reference artwork.
  rect(550,455,105,85,5);rect(554,448,97,23,4); // shirt and belt
  rect(571,520,30,44,13);rect(608,520,30,44,13);
  rect(554,543,48,17,2);rect(612,543,48,17,2);
  rect(563,374,88,92,15); // face
  rect(553,345,108,47,4);rect(541,383,129,15,5);
  rect(573,343,72,23,3);rect(592,332,32,30,3);rect(602,340,12,12,10);
  rect(584,419,10,13,17);rect(624,419,10,13,17);
  rect(600,446,18,8,12);
  // Title and punchy caption use existing self-contained bitmap font.
  rect(45,44,1110,194,1);
  center('KRISTALLRAUSCH',70,12,3);
  center('20 LEVEL',180,9,4);
  rect(0,566,1200,64,1);
  center('GRABEN  SAMMELN  ENTKOMMEN',582,5,3);
  const raw=new Uint8Array(H*(W+1));
  for(let y=0;y<H;y++)raw.set(px.subarray(y*W,(y+1)*W),y*(W+1)+1);
  return join([
    Uint8Array.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',Uint8Array.from([...be(W),...be(H),8,3,0,0,0])),
    chunk('PLTE',Uint8Array.from(pal.flat())),
    chunk('IDAT',deflate(raw)),
    chunk('IEND',new Uint8Array())
  ]);
}
