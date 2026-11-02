// Supply an actual 48MP JPEG and an EXIF-rotated equivalent; fixtures stay outside Git.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [large,oriented,small]=process.argv.slice(2);
if(!large||!oriented||!small)throw new Error('Supply large JPEG, EXIF-rotated equivalent, and a small reference JPEG');
const directory=resolve(process.env.ONGDU_BROWSER_REPORT||'models/card-recognition/reports/high-resolution');mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.ONGDU_CHROME_PATH?{executablePath:process.env.ONGDU_CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:1200,height:900}}),base=process.env.ONGDU_TEST_URL||'http://localhost:3100',checks=[],errors=[],requests=[];
page.on('pageerror',error=>errors.push(String(error)));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
await page.addInitScript(()=>{
 localStorage.setItem('ongdu.locale','en');window.__photoResults=[];window.__photoSizes=[];window.__bitmapOptions=[];window.__bitmapDisabled=false;window.__bitmapDelay=0;
 const bitmap=window.createImageBitmap.bind(window);
 window.createImageBitmap=async(source,options)=>{
  window.__bitmapOptions.push(options);if(window.__bitmapDisabled)throw new TypeError('Forced bitmap fallback');
  if(window.__bitmapDelay)await new Promise(resolve=>setTimeout(resolve,window.__bitmapDelay));
  return bitmap(source,options);
 };
 const Original=window.Worker;
 window.Worker=class extends Original{
  constructor(...args){super(...args);this.addEventListener('message',event=>{if(['result','error'].includes(event.data?.type))window.__photoResults.push(event.data);});}
  postMessage(...args){const data=args[0];if(data?.rgba)window.__photoSizes.push({width:data.width,height:data.height,bytes:data.rgba.byteLength});super.postMessage(...args);}
 };
});
const open=()=>page.goto(base+'/helper?provider=wasm');
const upload=path=>page.getByLabel('Upload photo from library').setInputFiles(resolve(path));
async function review(){
 await page.waitForFunction(()=>window.__photoResults.length>0,null,{timeout:90000});
 const data=await page.evaluate(()=>({results:window.__photoResults,sizes:window.__photoSizes,bitmap:window.__bitmapOptions}));
 assert.equal(data.results.at(-1).type,'result',JSON.stringify(data));
 await page.getByRole('button',{name:'Read photo again',exact:true}).waitFor();
 assert.ok(data.sizes.every(s=>Math.max(s.width,s.height)<=1600 && s.bytes<=1600*1600*4));
 const preview=await page.getByAltText('Your photo with numbered card regions').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
 return {...data,preview};
}
try{
 await open();await upload(large);const first=await review();assert.deepEqual(first.preview,{width:1600,height:1200});
 assert.ok(first.bitmap.some(o=>o.resizeWidth===1600&&o.resizeHeight===1200));checks.push('48MP JPEG is resized before preview and worker transfer');
 await page.screenshot({path:resolve(directory,'48mp-review.png'),fullPage:true});
 await open();await upload(oriented);const rotated=await review();assert.deepEqual(rotated.preview,{width:1600,height:1200});
 const identities=data=>data.results.at(-1).cards.map(c=>c.rank+'/'+c.suit).sort();
 assert.deepEqual(identities(rotated),identities(first));checks.push('EXIF-rotated 48MP JPEG is oriented once and recognized identically');
 await open();await page.evaluate(()=>{window.__bitmapDisabled=true;});await upload(large);
 const fallback=await review();assert.deepEqual(fallback.preview,{width:1600,height:1200});checks.push('48MP photo works through native image-element fallback');
 await open();await page.evaluate(()=>{window.__bitmapDelay=500;});await upload(large);
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.waitForTimeout(800);
 assert.equal(await page.evaluate(()=>window.__photoSizes.length),0);await page.getByRole('heading',{name:'Start with your cards'}).waitFor();checks.push('Cancelling preparation never starts inference or shows stale cards');
 await open();await page.evaluate(()=>{window.__bitmapDelay=300;});await upload(large);await upload(small);
 const replaced=await review();assert.ok(replaced.sizes.every(s=>s.width===640&&s.height===640));checks.push('A newer upload supersedes pending high-resolution preparation');
 await open();await page.getByLabel('Upload photo from library').setInputFiles({name:'unsupported.heic',mimeType:'image/heic',buffer:Buffer.from('unsupported HEIC fixture')});
 await page.getByText('This photo format could not be read.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.__photoSizes.length),0);checks.push('Unsupported HEIC shows a JPEG/PNG instruction before model loading');
 // A real browser video pipeline with a deterministic camera feed, without device permissions.
 await open();
 await page.evaluate(async source=>{
  const image=new Image();image.src=source;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1440;
  canvas.getContext('2d').drawImage(image,0,0,1920,1440);
  const stream=canvas.captureStream(5);window.__cameraStream=stream;
  navigator.mediaDevices.getUserMedia=async constraints=>{window.__cameraConstraints=constraints;return stream;};
 },'data:image/jpeg;base64,'+readFileSync(resolve(large)).toString('base64'));
 await page.getByRole('button',{name:'Take a photo',exact:true}).click();
 const capture=page.getByRole('button',{name:'Use this photo',exact:true});await capture.waitFor();
 await page.waitForFunction(()=>!document.querySelector('video')?.paused && document.querySelector('video')?.readyState>=2);
 assert.equal(await page.getByLabel('Camera preview').evaluate(video=>getComputedStyle(video).objectFit),'contain');
 await capture.click();const camera=await review();assert.deepEqual(camera.preview,{width:1600,height:1200});
 const cameraState=await page.evaluate(()=>({constraints:window.__cameraConstraints,tracks:window.__cameraStream.getTracks().map(t=>t.readyState)}));
 assert.deepEqual(cameraState.constraints.video.width,{ideal:1920});assert.deepEqual(cameraState.constraints.video.height,{ideal:1440});
 assert.ok(cameraState.tracks.every(state=>state==='ended'));
 checks.push('Camera frame is captured at 1600×1200, preview shows the full frame, and camera tracks stop');
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&(r.url.startsWith(base)||r.url.startsWith('blob:')||r.url.startsWith('data:'))));
 const report={browser:browser.version(),checks,large:first,oriented:rotated,fallback,camera,pageErrors:errors,limitations:['Desktop Chrome with real 48MP JPEG fixtures; physical iOS/Android devices and native HEIC support still require device checks.']};
 writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks,report:resolve(directory,'report.json')},null,2));
}finally{await browser.close();}
