import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {decodeYolo26,mergeSingleDeckDetections,prepareTensor,validateYolo26Manifest} from '../lib/card-detector/yolo26.ts';
import {workerScan} from '../lib/card-detector/lifecycle.ts';
const manifest=JSON.parse(readFileSync(new URL('../public/models/card-recognition/yolo26n-epoch4-d7f58ee5-single-deck-v1/manifest.json',import.meta.url)));

test('shipped experimental graph contract rejects head/schema mismatches',()=>{
 assert.equal(validateYolo26Manifest(manifest).output.mode,'raw');
 for(const patch of [{experimental:false},{architecture:'yolov8n'},{output:{...manifest.output,mode:'nms-free'}},{output:{...manifest.output,shape:[1,56,8401]}},{decoderVersion:'unknown'}]) assert.throws(()=>validateYolo26Manifest({...manifest,...patch}));
});
test('letterbox preserves RGB, normalizes, pads and validates input allocation',()=>{
 const rgba=new Uint8ClampedArray([255,0,0,255,0,255,0,255]);
 const data=prepareTensor(rgba,2,1);
 assert.equal(data.length,3*640*640);
 assert.ok(Math.abs(data[0]-114/255)<1e-7);
 assert.equal(data[160*640],1);
 assert.equal(data[640*640+160*640],0);
 assert.throws(()=>prepareTensor(rgba,2,2));
 assert.throws(()=>prepareTensor(rgba,10000,10000));
});
test('raw decoder applies class-aware NMS and maps/clips boxes into photo coordinates',()=>{
 const data=new Float32Array(56*8400);
 for(let i=0;i<3;i++) {data[i]=100;data[8400+i]=100;data[2*8400+i]=20;data[3*8400+i]=20;}
 data[4*8400]=.9;data[4*8400+1]=.8;data[5*8400+2]=.95;
 const result=decodeYolo26(data,[1,56,8400],manifest,640,640);
 assert.equal(result.length,2);
 assert.deepEqual(result.map(x=>x.classId),[1,0]);
 assert.deepEqual(result[0].box,{x:90,y:90,width:20,height:20});
 data[0]=NaN;assert.throws(()=>decodeYolo26(data,[1,56,8400],manifest,640,640));
});
test('one-to-one decoder never suppresses overlapping detections twice',()=>{
 const free={...manifest,decoderVersion:'yolo26-nms-free-v1',output:{...manifest.output,mode:'nms-free',shape:[1,300,6]}};
 const data=new Float32Array(1800);data.set([90,90,110,110,.9,0,90,90,110,110,.8,0]);
 assert.equal(decodeYolo26(data,[1,300,6],free,640,640).length,2);
 assert.throws(()=>decodeYolo26(data,[1,300,6],manifest,640,640));
 data[5]=52;assert.throws(()=>decodeYolo26(data,[1,300,6],free,640,640));
});
function fakeWorker(){return {terminated:0,postMessage(request){this.request=request;},terminate(){this.terminated++;}};}
const request=()=>({width:1,height:1,rgba:new ArrayBuffer(4),provider:'wasm'});
test('worker correlation rejects stale messages and disposes after success',async()=>{
 const worker=fakeWorker(),controller=new AbortController();
 const promise=workerScan(request(),controller.signal,()=>{},()=>worker);
 worker.onmessage({data:{id:'old',type:'result',cards:[]}});assert.equal(worker.terminated,0);
 worker.onmessage({data:{id:worker.request.id,type:'result',cards:[{rank:'A',suit:'spades'}]}});
 assert.equal((await promise)[0].rank,'A');assert.equal(worker.terminated,1);
 controller.abort();assert.equal(worker.terminated,1);
});
test('cancellation terminates active work and cannot return a stale result',async()=>{
 const worker=fakeWorker(),controller=new AbortController();
 const promise=workerScan(request(),controller.signal,()=>{},()=>worker);
 controller.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(worker.terminated,1);
 worker.onmessage({data:{id:worker.request.id,type:'result',cards:[]}});assert.equal(worker.terminated,1);
});
test('worker errors reject and release resources; already-aborted scans never create a worker',async()=>{
 for(const type of ['onerror','onmessageerror']){
  const worker=fakeWorker();const promise=workerScan(request(),new AbortController().signal,()=>{},()=>worker);
  worker[type]();await assert.rejects(promise,error=>error.code==='RUNTIME');assert.equal(worker.terminated,1);
 }
 const controller=new AbortController();controller.abort();
 assert.throws(()=>workerScan(request(),controller.signal,()=>{},()=>{throw new Error('worker must not start');}),{name:'AbortError'});
});

test('single-deck merging combines distant opposite corners and keeps the strongest preview region',()=>{
 const weak={classId:0,confidence:.6,box:{x:5,y:5,width:20,height:30}};
 const strong={classId:0,confidence:.95,box:{x:500,y:500,width:20,height:30}};
 const input=[weak,strong], before=structuredClone(input);
 const result=mergeSingleDeckDetections(input,manifest.classes,.8);
 assert.equal(result.length,1);assert.deepEqual(result[0].box,strong.box);
 assert.equal(result[0].confidence,.95);assert.equal(result[0].uncertain,false);
 assert.deepEqual(input,before);
});
test('single-deck merging preserves different suits and ranks and flags weak identities',()=>{
 const result=mergeSingleDeckDetections([
  {classId:0,confidence:.9,box:{x:0,y:0,width:10,height:10}},
  {classId:1,confidence:.9,box:{x:30,y:0,width:10,height:10}},
  {classId:4,confidence:.5,box:{x:60,y:0,width:10,height:10}},
 ],manifest.classes,.8);
 assert.equal(result.length,3);assert.equal(result.filter(d=>d.uncertain).length,1);
 assert.equal(mergeSingleDeckDetections([],manifest.classes,.8).length,0);
});
test('conflicting identities on any merged corner remain separate and uncertain',()=>{
 const result=mergeSingleDeckDetections([
  {classId:0,confidence:.99,box:{x:500,y:500,width:20,height:30}},
  {classId:0,confidence:.9,box:{x:0,y:0,width:20,height:30}},
  {classId:1,confidence:.95,box:{x:0,y:0,width:20,height:30}},
 ],manifest.classes,.8);
 assert.equal(result.length,2);assert.ok(result.every(d=>d.uncertain));
 assert.throws(()=>validateYolo26Manifest({...manifest,postprocess:{...manifest.postprocess,rulesVersion:'review-corners-v1'}}));
});
