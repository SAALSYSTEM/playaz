// Browser acceptance suite. NOT executed in the current development environment.
// Run against a locally served checkout, never production:
// PLAYSAAL_TEST_URL=http://127.0.0.1:8799 node --test tests/mysupermarkt.browser.mjs
// Requires Playwright + Chromium already installed. Does not start a server.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const base=process.env.PLAYSAAL_TEST_URL;
let browser;
before(async()=>{
  if(!base)return;
  const u=new URL(base);if(!['localhost','127.0.0.1'].includes(u.hostname))throw new Error('Nur lokale Testserver erlaubt.');
  const require=createRequire(import.meta.url);let pw;try{pw=require('playwright');}catch(_){pw=require('/opt/npm-tools/node_modules/playwright');}
  browser=await pw.chromium.launch({args:['--enable-webgl','--ignore-gpu-blocklist']});
});
after(async()=>browser?.close());
for(const [width,height]of [[375,812],[390,844],[768,1024],[1440,900]])test(`Browser: ${width} px, WebGL, Menü, Steuerung, Speichern`,{skip:!base},async()=>{
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<800}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/spiele/mysupermarkt');
  await page.getByRole('button',{name:/Meinen Laden öffnen/}).click();
  assert.equal(await page.locator('#fatal').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(400);await page.keyboard.up('ArrowRight');
  if(width<800){
    // Pointer/mouse path smoke check; a real iPhone multitouch test remains manual.
    await page.mouse.move(width*.4,height*.48);await page.mouse.down();await page.mouse.move(width*.6,height*.55,{steps:8});await page.waitForTimeout(300);await page.mouse.up();
    assert.equal(await page.locator('#joystick').isVisible(),false);
  }
  for(const name of ['Einkauf','Ausbau','Team','Bilanz']){
    await page.getByRole('button',{name,exact:true}).click();assert.equal(await page.locator('#modal').isVisible(),true);
    assert.equal(await page.locator('.panel').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),true);
    await page.getByRole('button',{name:'Schließen'}).click();
  }
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const saved=await page.evaluate(()=>localStorage.getItem('mysupermarkt.v1'));assert.ok(saved);
  await page.reload();await page.getByRole('button',{name:/Meinen Laden weiterführen/}).click();
  assert.deepEqual(errors,[]);await context.close();
});
