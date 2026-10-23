import {renderPreview,renderSebiPreview,renderKristallPreview} from './vorschau.js';

const BASE='/spiele/blocksaal';
const SEBI='/spiele/sprungsebi';
function lines(raw){return raw!==null&&/^(0|[1-9]\d{0,3})$/.test(raw)?Number(raw):null;}
function replaceMeta(html,key,value){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return html.replace(new RegExp(`(<meta (?:property|name)="${escaped}" content=")[^"]*(")`),(_,a,b)=>a+value+b);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/og/kristallrausch/start.png'){
      const image=renderKristallPreview();
      return new Response(image,{headers:{
        'Content-Type':'image/png',
        'Cache-Control':'public, max-age=86400',
        'X-Content-Type-Options':'nosniff'
      }});
    }
    if(url.pathname.startsWith('/og/blocksaal/')){
      const m=url.pathname.match(/^\/og\/blocksaal\/(start|0|[1-9]\d{0,3})\.png$/);
      if(!m)return new Response('Not found',{status:404});
      const image=renderPreview(m[1]==='start'?null:Number(m[1]));
      return new Response(image,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    }
    if(url.pathname.startsWith('/og/sprungsebi/')){
      const m=url.pathname.match(/^\/og\/sprungsebi\/(start|([1-9]|[12]\d|30)-([0-9]|[1-8]\d|90))\.png$/);
      if(!m)return new Response('Not found',{status:404});
      const image=m[1]==='start'?renderSebiPreview():renderSebiPreview(Number(m[2]),Number(m[3]));
      return new Response(image,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    }
    if(url.pathname==='/spiele/turmschicht'){
      // Herausforderungs-Link ?l=Level&m=s|p&t=Hundertstel: nur Vorschautext anpassen, das Spiel liest die Werte selbst
      const level=Number(url.searchParams.get('l')),cs=Number(url.searchParams.get('t')),mode=url.searchParams.get('m');
      if(!Number.isInteger(level)||level<1||level>30||!Number.isInteger(cs)||cs<100||cs>360000||(mode!=='s'&&mode!=='p'))return env.ASSETS.fetch(request);
      const asset=await env.ASSETS.fetch(new Request(new URL('/spiele/turmschicht',url.origin),request));if(!asset.ok)return asset;
      let html=await asset.text();const sec=Math.floor(cs/100),time=(sec>=60?Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'):String(sec))+','+String(cs%100).padStart(2,'0')+' s';
      const modeName=mode==='p'?'Perfekter Lauf':'Schneller Ausbruch';
      const title=`Turmschicht Level ${level} · ${modeName}: ${time} – schaffst du es schneller?`;
      const description=mode==='p'?`Alle 3 Sterne und raus in ${time}. Schlag meine Zeit – ohne Anmeldung.`:`In ${time} aus dem Turm ausgebrochen. Schlag meine Zeit – ohne Anmeldung.`;
      for(const key of ['og:title','twitter:title'])html=replaceMeta(html,key,title);
      for(const key of ['og:description','twitter:description'])html=replaceMeta(html,key,description);
      html=replaceMeta(html,'og:url',`${url.origin}/spiele/turmschicht?l=${level}&amp;m=${mode}&amp;t=${cs}`);
      const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','public, max-age=300');headers.delete('Content-Length');headers.delete('ETag');return new Response(html,{status:200,headers});
    }
    if(url.pathname==='/spiele/dino-leiterhelden'){
      // Herausforderungs-Link ?l=Level&t=Hundertstel&r=Rücksetzer: nur Vorschautext anpassen, das Spiel liest die Werte selbst
      const level=Number(url.searchParams.get('l')),cs=Number(url.searchParams.get('t')),resets=Number(url.searchParams.get('r')??0);
      if(!Number.isInteger(level)||level<1||level>90||!Number.isInteger(cs)||cs<100||cs>360000||!Number.isInteger(resets)||resets<0||resets>999)return env.ASSETS.fetch(request);
      const asset=await env.ASSETS.fetch(new Request(new URL('/spiele/dino-leiterhelden',url.origin),request));if(!asset.ok)return asset;
      let html=await asset.text();const sec=Math.floor(cs/100),time=(sec>=60?Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'):String(sec))+','+String(cs%100).padStart(2,'0')+' s';
      const title=`Dino-Leiterhelden Level ${level}: ${time} – schaffst du es schneller?`;
      const description=`Ich habe alle 3 Dino-Freunde in ${time} ins Baumhaus gebracht. Schlag meine Zeit!`;
      for(const key of ['og:title','twitter:title'])html=replaceMeta(html,key,title);
      for(const key of ['og:description','twitter:description'])html=replaceMeta(html,key,description);
      html=replaceMeta(html,'og:url',`${url.origin}/spiele/dino-leiterhelden?l=${level}&amp;t=${cs}&amp;r=${resets}`);
      const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','public, max-age=300');headers.delete('Content-Length');headers.delete('ETag');return new Response(html,{status:200,headers});
    }
    if(url.pathname==='/spiele/geisterschloss'){
      const level=Number(url.searchParams.get('l')),points=Number(url.searchParams.get('p'));
      if(!Number.isInteger(level)||level<1||level>20||!Number.isInteger(points)||points<0||points>999999)return env.ASSETS.fetch(request);
      const asset=await env.ASSETS.fetch(new Request(new URL('/spiele/geisterschloss',url.origin),request));if(!asset.ok)return asset;
      let html=await asset.text();const number=points.toLocaleString('de-DE');
      const title=`Level ${level}/20 geschafft · ${number} Punkte – schlägst du mich?`;
      const description=`Ich habe Level ${level} im Geisterschloss geschafft und ${number} Punkte geholt. Kommst du weiter?`;
      for(const key of ['og:title','twitter:title'])html=replaceMeta(html,key,title);
      for(const key of ['og:description','twitter:description'])html=replaceMeta(html,key,description);
      html=replaceMeta(html,'og:url',`${url.origin}/spiele/geisterschloss?l=${level}&amp;p=${points}`);
      const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','public, max-age=300');headers.delete('Content-Length');headers.delete('ETag');return new Response(html,{status:200,headers});
    }
    if(url.pathname!==BASE&&url.pathname!==SEBI)return env.ASSETS.fetch(request);
    if(url.pathname===SEBI){
      const level=Number(url.searchParams.get('c')),stars=Number(url.searchParams.get('s'));
      if(!Number.isInteger(level)||level<1||level>30||!Number.isInteger(stars)||stars<0||stars>90)return env.ASSETS.fetch(request);
      const asset=await env.ASSETS.fetch(new Request(new URL(SEBI,url.origin),request));if(!asset.ok)return asset;
      let html=await asset.text();const title=`Bis Level ${level} vor dem Hochwasser – kommst du höher?`,description=`Ich bin bei SprungSebi bis Level ${level} vor dem Hochwasser geflohen und habe ${stars} von 90 Sternen gesammelt. Jetzt spielen!`,href=`${url.origin}${SEBI}?c=${level}&amp;s=${stars}`,image=`${url.origin}/og/sprungsebi/${level}-${stars}.png`;
      for(const key of ['og:title','twitter:title'])html=replaceMeta(html,key,title);
      for(const key of ['og:description','twitter:description'])html=replaceMeta(html,key,description);
      html=replaceMeta(html,'og:url',href);for(const key of ['og:image','twitter:image'])html=replaceMeta(html,key,image);
      const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','public, max-age=300');headers.delete('Content-Length');headers.delete('ETag');return new Response(html,{status:200,headers});
    }
    const count=lines(url.searchParams.get('c'));
    if(count===null)return env.ASSETS.fetch(request);
    const base=BASE;
    const asset=await env.ASSETS.fetch(new Request(new URL(base,url.origin),request));
    if(!asset.ok)return asset;
    let html=await asset.text();
    const number=count.toLocaleString('de-DE');
    const unit=count===1?'Reihe':'Reihen';
    const title=`${number} ${unit} geschafft – schlägst du mich?`;
    const description=`Ich habe ${number} ${unit} bei BlockSaal geschafft. Schlägst du mich? Spiele kostenlos auf PlaySaal.`;
    const href=`${url.origin}${base}?c=${count}`;
    const image=`${url.origin}/og/blocksaal/${count}.png`;
    for(const key of ['og:title','twitter:title'])html=replaceMeta(html,key,title);
    for(const key of ['og:description','twitter:description'])html=replaceMeta(html,key,description);
    html=replaceMeta(html,'og:url',href);
    for(const key of ['og:image','twitter:image'])html=replaceMeta(html,key,image);
    const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=utf-8');
    headers.set('Cache-Control','public, max-age=300');headers.delete('Content-Length');headers.delete('ETag');
    return new Response(html,{status:200,headers});
  }
};
