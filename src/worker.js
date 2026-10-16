import {renderPreview,renderSanduhrPreview} from './vorschau.js';

const BASE='/spiele/blocksaal';
const SANDUHR='/spiele/sanduhrblock';
function lines(raw){return raw!==null&&/^(0|[1-9]\d{0,3})$/.test(raw)?Number(raw):null;}
function replaceMeta(html,key,value){
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return html.replace(new RegExp(`(<meta (?:property|name)="${escaped}" content=")[^"]*(")`),(_,a,b)=>a+value+b);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/og/blocksaal/')){
      const m=url.pathname.match(/^\/og\/blocksaal\/(start|0|[1-9]\d{0,3})\.png$/);
      if(!m)return new Response('Not found',{status:404});
      const image=renderPreview(m[1]==='start'?null:Number(m[1]));
      return new Response(image,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    }
    if(url.pathname.startsWith('/og/sanduhrblock/')){
      const m=url.pathname.match(/^\/og\/sanduhrblock\/(start|0|[1-9]\d{0,3})\.png$/);
      if(!m)return new Response('Not found',{status:404});
      const image=renderSanduhrPreview(m[1]==='start'?null:Number(m[1]));
      return new Response(image,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    }
    if(url.pathname!==BASE&&url.pathname!==SANDUHR)return env.ASSETS.fetch(request);
    const count=lines(url.searchParams.get('c'));
    if(count===null)return env.ASSETS.fetch(request);
    const sanduhr=url.pathname===SANDUHR,base=sanduhr?SANDUHR:BASE;
    const asset=await env.ASSETS.fetch(new Request(new URL(base,url.origin),request));
    if(!asset.ok)return asset;
    let html=await asset.text();
    const number=count.toLocaleString('de-DE');
    const unit=sanduhr?(count===1?'Kern':'Kerne'):(count===1?'Reihe':'Reihen');
    const title=`${number} ${unit} geschafft – schlägst du mich?`;
    const description=sanduhr?`Ich habe ${number} ${unit} bei Sanduhrblock erzeugt. Schlägst du mich? Spiele kostenlos auf PlaySaal.`:`Ich habe ${number} ${unit} bei BlockSaal geschafft. Schlägst du mich? Spiele kostenlos auf PlaySaal.`;
    const href=`${url.origin}${base}?c=${count}`;
    const image=`${url.origin}/og/${sanduhr?'sanduhrblock':'blocksaal'}/${count}.png`;
    for(const key of ['og:title','twitter:title'])html=replaceMeta(html,key,title);
    for(const key of ['og:description','twitter:description'])html=replaceMeta(html,key,description);
    html=replaceMeta(html,'og:url',href);
    for(const key of ['og:image','twitter:image'])html=replaceMeta(html,key,image);
    const headers=new Headers(asset.headers);headers.set('Content-Type','text/html; charset=utf-8');
    headers.set('Cache-Control','public, max-age=300');headers.delete('Content-Length');headers.delete('ETag');
    return new Response(html,{status:200,headers});
  }
};
