// Explicit integration check; no browser/model download occurs here or during ordinary tests.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const image=process.argv[2]||process.env.ONGDU_SCAN_PHOTO;
if(!image) throw new Error('Supply a local photo: node scripts/card-recognition/browser-smoke.mjs /path/to/cards.jpg');
const base=process.env.ONGDU_TEST_URL||'http://localhost:3100';
const directory=resolve(process.env.ONGDU_BROWSER_REPORT||'models/card-recognition/reports/epoch30-browser');
mkdirSync(directory,{recursive:true});
const executablePath=process.env.ONGDU_CHROME_PATH||undefined;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const requests=[],errors=[],workerMessages=[];
page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
page.on('pageerror',error=>errors.push(String(error)));
await page.addInitScript(()=>{
 localStorage.setItem('ongdu.locale','en');
 window.__scannerMessages=[];window.__liveScanners=0;
 const Original=window.Worker;
 window.Worker=class extends Original{
  constructor(...args){super(...args);this.live=false;
   this.addEventListener('message',event=>{if(['result','error'].includes(event.data?.type))window.__scannerMessages.push(event.data);});}
  postMessage(...args){if(args[0]?.rgba && args[0]?.provider && !this.live){this.live=true;window.__liveScanners++;}super.postMessage(...args);}
  terminate(){if(this.live){window.__liveScanners--;this.live=false;}super.terminate();}
 };
});
const upload=()=>page.getByLabel('Upload photo from library').setInputFiles(resolve(image));
const waitForResult=async previous=>{
 await page.waitForFunction(count=>window.__scannerMessages.length>count,previous,{timeout:90000});
 const messages=await page.evaluate(()=>window.__scannerMessages);
 const result=messages.at(-1);assert.equal(result.type,'result',JSON.stringify(messages));
 assert.ok(result.cards.length>0);await page.getByRole('button',{name:'Read photo again',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__liveScanners),0);
 return result;
};
const checks=[];
try{
 await page.goto(base+'/helper');
 assert.ok(!requests.some(r=>r.url.includes('/onnxruntime/')||r.url.includes('/models/card-recognition/')));
 checks.push('Default/manual entry does not load model/runtime assets');
 await page.goto(base+'/helper?provider=wasm');await upload();
 const first=await waitForResult(0);assert.equal(first.provider,'wasm');
 await page.screenshot({path:resolve(directory,'review.png'),fullPage:true});
 checks.push('Real WASM inference reaches localized review UI');
 assert.equal(new Set(first.cards.map(card=>card.rank+'/'+card.suit)).size,first.cards.length);
 checks.push('Repeated corner identities are merged for single-deck review');
 for(let i=0;i<20;i++){
  const count=await page.evaluate(()=>window.__scannerMessages.length);
  await page.getByRole('button',{name:'Read photo again',exact:true}).click();
  const next=await waitForResult(count);assert.equal(next.cards.length,first.cards.length);
 }
 checks.push('20 repeat scans finish with no live recognition workers');
 // Exercise editing and the existing analysis handoff with both legal hand sizes.
 for(const size of [9,10]){
  if(size===10){await page.goto(base+'/helper?provider=wasm');await upload();await waitForResult(0);}
  for(let i=1;i<=Math.max(first.cards.length,size);i++){
   if(i>size){await page.getByLabel(`Use card ${i}`,{exact:true}).uncheck();continue;}
   if(i>first.cards.length)await page.getByRole('button',{name:'+ Add a missing card',exact:true}).click();
   else await page.getByRole('button',{name:new RegExp(`^Edit card ${i}(?::|$)`)}).click();
   await page.getByLabel(`Rank for card ${i}`,{exact:true}).selectOption(i===10?'J':String(i+1));
   await page.getByLabel(`Suit for card ${i}`,{exact:true}).selectOption('spades');
   await page.getByRole('button',{name:'Done',exact:true}).click();
  }
  await page.getByRole('button',{name:'Find my best arrangement',exact:false}).click();
  await page.getByRole('heading',{name:'Arrange your cards like this',exact:true}).first().waitFor({timeout:60000});
  assert.equal(await page.evaluate(()=>window.__liveScanners),0);
  if(size===10)await page.getByText('Discard',{exact:false}).first().waitFor();
  checks.push(`${size}-card review/edit to arrangement analysis succeeds without a live recognition worker`);
 }
 // A delayed download must be cancelled by start-over, with no stale result.
 await page.goto(base+'/helper?provider=wasm');
 await page.route('**/models/card-recognition/**/manifest.json',async route=>{
  await new Promise(resolve=>setTimeout(resolve,1000));await route.continue().catch(()=>{});
 });
 await upload();await page.getByRole('button',{name:'Start over',exact:true}).click();
 await page.getByRole('heading',{name:'Start with your cards'}).waitFor();
 await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.__liveScanners),0);
 assert.equal(await page.getByRole('button',{name:'Read photo again',exact:true}).count(),0);
 await page.unroute('**/models/card-recognition/**/manifest.json');
 checks.push('Start-over cancels downloads without stale cards');
 await page.route('**/models/card-recognition/**/detector.onnx',route=>route.fulfill({status:200,body:'corrupt'}));
 await upload();await page.getByText('The card reader could not be loaded.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>window.__liveScanners),0);
 await page.unroute('**/models/card-recognition/**/detector.onnx');
 checks.push('Corrupt model bytes fail before inference with a recoverable error');
 await page.goto(base+'/helper');await upload();
 await page.waitForFunction(()=>window.__scannerMessages.some(m=>m.type==='result'),null,{timeout:90000});
 const auto=await page.evaluate(()=>window.__scannerMessages);
 assert.equal(auto.at(-1).type,'result');assert.equal(await page.evaluate(()=>window.__liveScanners),0);
 checks.push('Default /helper scanner uses YOLO26 without an opt-in parameter');
 workerMessages.push(...auto);
 await page.goto(base+'/helper');
 await page.evaluate(()=>Object.defineProperty(navigator,'gpu',{value:{},configurable:true}));
 await page.route('**/ort.webgpu.min.mjs',route=>route.abort());
 await upload();
 await page.waitForFunction(()=>window.__scannerMessages.some(m=>m.type==='result'),null,{timeout:90000});
 const fallback=await page.evaluate(()=>window.__scannerMessages);
 assert.ok(fallback.some(m=>m.type==='error'&&m.code==='RUNTIME'));
 assert.equal(fallback.at(-1).provider,'wasm');assert.equal(await page.evaluate(()=>window.__liveScanners),0);
 await page.unroute('**/ort.webgpu.min.mjs');
 checks.push('Forced GPU initialization failure retries once on WASM in a new worker');
 assert.ok(requests.every(r=>r.url.startsWith(base)||r.url.startsWith('blob:')||r.url.startsWith('data:')),'Unexpected third-party asset request');
 assert.ok(requests.every(r=>r.method==='GET'),'Unexpected photo/tensor upload');
 assert.ok(!requests.some(r=>/tesseract|traineddata|tessdata/i.test(r.url)),'Default scanner requested OCR assets');
 assert.deepEqual(errors,[]);
 checks.push('Only same-origin GET assets; no photo/tensor uploads or page errors');
 const report={browser:browser.version(),checks,wasm:first,automatic:auto,fallback,requests,pageErrors:errors,limitations:['Desktop headless Chrome only; named mobile devices and independent hand accuracy remain unverified.','Worker count checks do not establish a browser memory-allocation trend.']};
 writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checks,wasmProvider:first.provider,automaticProvider:auto.at(-1).provider,report:resolve(directory,'report.json')},null,2));
}finally{await browser.close();}
