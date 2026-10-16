import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import worker from '../src/worker.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=join(dirname(fileURLToPath(import.meta.url)),'../public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
let server,browser,base;
async function asset(request){
  const path=new URL(request.url).pathname;
  const file=join(root,(path==='/'?'index.html':path==='/spiele/blocksaal'?'spiele/blocksaal.html':path).replace(/^\//,''));
  if(!file.startsWith(root+'/'))return new Response('Not found',{status:404});
  try{const ext=file.match(/\.[^.]+$/)?.[0]||'';return new Response(readFileSync(file),{headers:{'Content-Type':mime[ext]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
}
test('BlockSaal on mobile and share preview',async t=>{
  if(!existsSync(chromium.executablePath())){t.skip('Chromium is not installed in this environment');return;}
  server=createServer(async(req,res)=>{try{
    const request=new Request('http://127.0.0.1:'+server.address().port+req.url);
    const response=await worker.fetch(request,{ASSETS:{fetch:asset}});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.statusCode=500;res.end(String(e));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({args:['--no-sandbox']});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  const response=await fetch(base+'/spiele/blocksaal?c=42');const html=await response.text();
  assert.equal(response.status,200);assert.match(html,/42 Reihen geschafft – schlägst du mich/);
  assert.match(html,/rel="canonical" href="https:\/\/playsaal.com\/spiele\/blocksaal"/);
  const image=await fetch(base+'/og/blocksaal/42.png');assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{navigator.share=async data=>{window.shared=data;};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/spiele/blocksaal?c=42');
  assert.match(await page.locator('#challenge').innerText(),/mehr als 42 Reihen/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.screenshot({path:'/tmp/blocksaal-start-browser.png'});
  await page.getByRole('button',{name:'Spielen'}).click();
  await page.waitForTimeout(100);
  await page.screenshot({path:'/tmp/blocksaal-playing-browser.png'});
  for(let i=0;i<35;i++){await page.locator('[data-action="drop"]').tap();if(await page.locator('#share').isVisible())break;}
  assert.ok(await page.locator('#share').isVisible(),'game ends after the board fills');
  await page.locator('#share').click();
  const shared=await page.evaluate(()=>window.shared);
  assert.match(shared.text,/Schlägst du mich\?/);
  assert.match(shared.text,/https:\/\/playsaal.com\/spiele\/blocksaal\?c=\d+/);
  assert.deepEqual(errors,[]);
});
