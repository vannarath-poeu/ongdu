import assert from 'node:assert/strict';
import test from 'node:test';
import {readPhotoHeader,photoDimensions,decodePhotoCanvas,encodePhotoCanvas,preparePhotoUpload,MAX_PHOTO_BYTES} from '../lib/card-detector/photo.ts';

function jpeg(width,height,orientation=1){
 const tiff=new Uint8Array(26),v=new DataView(tiff.buffer);
 v.setUint16(0,0x4949);v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,1,true);
 v.setUint16(10,0x112,true);v.setUint16(12,3,true);v.setUint32(14,1,true);v.setUint16(18,orientation,true);
 return new Uint8Array([255,216,255,225,0,34,69,120,105,102,0,0,...tiff,255,192,0,8,8,height>>8,height&255,width>>8,width&255,0,255,217]);
}
function environment({width=1600,height=1200,bitmapFailure=false,imageFailure=false}={}){
 const state={closed:0,options:null,revoked:[],draws:[],encoded:0};
 const image={naturalWidth:8000,naturalHeight:6000,src:'',decode:async()=>{if(imageFailure)throw new Error('unsupported');}};
 const env={bitmap:async(_blob,options)=>{state.options=options;if(bitmapFailure)throw new Error('unsupported');return {width,height,close(){state.closed++;}};},
 image:()=>image,objectURL:()=> 'blob:fixture',revokeURL:url=>state.revoked.push(url),canvas:()=>({width:0,height:0,
 getContext:()=>({fillStyle:'',fillRect(){},drawImage(...args){state.draws.push(args);}}),
 toBlob(callback){state.encoded++;callback(new Blob(['bounded'],{type:'image/jpeg'}));}})};
 return {env,state,image};
}
test('reads 48MP JPEG dimensions and EXIF rotation without decoding pixels',()=>{
 assert.deepEqual(readPhotoHeader(jpeg(8000,6000)),{width:8000,height:6000,orientation:1});
 assert.deepEqual(readPhotoHeader(jpeg(6000,8000,6)),{width:6000,height:8000,orientation:6});
 assert.equal(readPhotoHeader(new Uint8Array([255,216,255,225,255,255])),null);
 assert.equal(readPhotoHeader(new Uint8Array([1,2,3])),null);
});
test('large portrait/landscape/panorama photos fit the bounded canvas without upscaling',()=>{
 assert.deepEqual(photoDimensions(8000,6000),{width:1600,height:1200});
 assert.deepEqual(photoDimensions(6000,8000),{width:1200,height:1600});
 assert.deepEqual(photoDimensions(20000,1000),{width:1600,height:80});
 assert.deepEqual(photoDimensions(640,480),{width:640,height:480});
 assert.throws(()=>photoDimensions(0,100),e=>e.code==='PHOTO_DECODE');
 assert.throws(()=>photoDimensions(30000,30000),e=>e.code==='PHOTO_TOO_LARGE');
});
test('requests oriented decoder-side resizing for a 48MP photo and releases its bitmap',async()=>{
 const {env,state}=environment();
 const canvas=await decodePhotoCanvas(new Blob([jpeg(6000,8000,6)]),new AbortController().signal,env);
 assert.equal(canvas.width,1600);assert.equal(canvas.height,1200);
 assert.deepEqual(state.options,{imageOrientation:'from-image',resizeQuality:'high',resizeWidth:1600,resizeHeight:1200});
 assert.equal(state.closed,1);
});
test('falls back to native image decoding when bitmap resizing is unsupported',async()=>{
 const {env,state,image}=environment({bitmapFailure:true});
 const canvas=await decodePhotoCanvas(new Blob([jpeg(8000,6000)]),new AbortController().signal,env);
 assert.equal(canvas.width,1600);assert.equal(canvas.height,1200);
 assert.deepEqual(state.revoked,['blob:fixture']);assert.equal(image.src,'');
});
test('unsupported photo formats and oversized files report specific errors',async()=>{
 const {env}=environment({bitmapFailure:true,imageFailure:true});
 await assert.rejects(decodePhotoCanvas(new Blob(['unsupported']),new AbortController().signal,env),e=>e.code==='PHOTO_DECODE');
 await assert.rejects(decodePhotoCanvas({size:MAX_PHOTO_BYTES+1},new AbortController().signal,env),e=>e.code==='PHOTO_TOO_LARGE');
});
test('cancels decode promptly and closes a bitmap that completes late',async()=>{
 const {env,state}=environment();let finish;
 const started=new Promise(resolve=>{env.bitmap=()=>{resolve();return new Promise(r=>{finish=r;});};});
 const controller=new AbortController();
 const pending=decodePhotoCanvas(new Blob([jpeg(8000,6000)]),controller.signal,env);
 await started;controller.abort();await assert.rejects(pending,{name:'AbortError'});
 finish({width:1600,height:1200,close(){state.closed++;}});
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(state.closed,1);assert.equal(state.draws.length,0);
});
test('small JPEG uploads avoid recompression; resized uploads become bounded JPEG blobs',async()=>{
 const small=environment({width:640,height:640}),blob=new Blob([jpeg(640,640)],{type:'image/jpeg'});
 assert.equal(await preparePhotoUpload(blob,new AbortController().signal,small.env),blob);
 assert.equal(small.state.encoded,0);assert.equal(small.state.closed,1);
 const large=environment();const result=await preparePhotoUpload(new Blob([jpeg(8000,6000)]),new AbortController().signal,large.env);
 assert.equal(result.type,'image/jpeg');assert.equal(large.state.encoded,1);
});

test('unknown-header formats keep native dimensions rather than requesting an upscale',async()=>{
 const {env,state}=environment({width:320,height:640});
 const canvas=await decodePhotoCanvas(new Blob(['webp fixture']),new AbortController().signal,env);
 assert.deepEqual(state.options,{imageOrientation:'from-image',resizeQuality:'high'});
 assert.equal(canvas.width,320);assert.equal(canvas.height,640);
});
test('portrait formats without headers still produce a bounded canvas',async()=>{
 const {env}=environment({width:3000,height:12000});
 const canvas=await decodePhotoCanvas(new Blob(['portrait fixture']),new AbortController().signal,env);
 assert.equal(canvas.width,400);assert.equal(canvas.height,1600);
});
test('cancelling camera encoding releases pixels and rejects a late result',async()=>{
 let finish;
 const canvas={width:1600,height:1200,toBlob(callback){finish=callback;}};
 const controller=new AbortController();
 const pending=encodePhotoCanvas(canvas,controller.signal);
 controller.abort();await assert.rejects(pending,{name:'AbortError'});
 assert.equal(canvas.width,1);assert.equal(canvas.height,1);
 finish(new Blob(['late'],{type:'image/jpeg'}));
});
test('failed camera encoding releases its canvas and reports a decode error',async()=>{
 const canvas={width:1600,height:1200,toBlob(callback){callback(null);}};
 await assert.rejects(encodePhotoCanvas(canvas,new AbortController().signal),e=>e.code==='PHOTO_DECODE');
 assert.equal(canvas.width,1);assert.equal(canvas.height,1);
});
