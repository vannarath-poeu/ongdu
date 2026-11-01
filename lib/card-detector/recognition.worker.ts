import type * as Ort from 'onnxruntime-web';
import { verifyModelBytes } from './contract';
import { MODEL_MANIFEST_URL, RUNTIME_VERSION, decodeYolo26, mergeSingleDeckDetections, prepareTensor, validateYolo26Manifest } from './yolo26';
import type { ScanRequest, ScanResponse } from './protocol';

async function boundedFetch(url: string, limit: number): Promise<ArrayBuffer> {
  // Next.js boots workers from blob URLs, so relative fetches need an explicit origin.
  const response=await fetch(new URL(url,self.location.origin),{cache:'force-cache',credentials:'omit',redirect:'error'});
  if (!response.ok || Number(response.headers.get('content-length') ?? 0)>limit) throw new Error('Asset unavailable.');
  const reader=response.body?.getReader();
  if (!reader) throw new Error('Asset body unavailable.');
  const chunks: Uint8Array[]=[];
  let length=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      length+=value.byteLength;
      if (length>limit) throw new Error('Asset exceeds limit.');
      chunks.push(value);
    }
  } catch(error) { await reader.cancel(); throw error; }
  const bytes=new Uint8Array(length);
  let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  return bytes.buffer;
}

let busy=false;
self.onmessage=async ({data:request}: MessageEvent<ScanRequest>)=>{
  if (busy) return;
  busy=true;
  const {id,width,height,provider}=request;
  const send=(response:ScanResponse)=>self.postMessage(response);
  let session: Ort.InferenceSession | undefined;
  let phase: 'ASSET' | 'RUNTIME' | 'NO_CARDS'='ASSET';
  const started=performance.now();
  try {
    send({id,type:'progress',stage:'loading'});
    const bytes=await boundedFetch(MODEL_MANIFEST_URL,256*1024);
    const manifest=validateYolo26Manifest(JSON.parse(new TextDecoder().decode(bytes)));
    const asset=manifest.assets[0];
    const model=await boundedFetch(asset.url,asset.bytes);
    await verifyModelBytes(model,asset);
    phase='RUNTIME';
    const base=new URL(`/onnxruntime/${RUNTIME_VERSION}/`,self.location.origin).href;
    const runtimeUrl=base+`ort.${provider==='webgpu'?'webgpu':'wasm'}.min.mjs`;
    const ort: typeof Ort=await import(/* webpackIgnore: true */ runtimeUrl);
    ort.env.wasm.wasmPaths=base;
    ort.env.wasm.numThreads=1;
    ort.env.wasm.proxy=false;
    session=await ort.InferenceSession.create(model,{executionProviders:[provider],graphOptimizationLevel:'all'});
    if (session.inputNames.length!==1 || session.inputNames[0]!==manifest.input.name || session.outputNames.length!==1 || session.outputNames[0]!==manifest.output.name) throw new Error('Graph name mismatch.');
    send({id,type:'progress',stage:'reading'});
    const tensor=new ort.Tensor('float32',prepareTensor(new Uint8ClampedArray(request.rgba),width,height),[1,3,640,640]);
    let outputs: Ort.InferenceSession.ReturnType;
    try { outputs=await session.run({[manifest.input.name]:tensor}); } finally { tensor.dispose(); }
    const output=outputs[manifest.output.name];
    try {
      if (output.type!=='float32' || !(output.data instanceof Float32Array)) throw new Error('Graph dtype mismatch.');
      const detections=mergeSingleDeckDetections(
        decodeYolo26(output.data,output.dims,manifest,width,height),manifest.classes,manifest.postprocess.trustedThreshold);
      phase='NO_CARDS';
      if (!detections.length || detections.length>manifest.postprocess.reviewLimit) throw new Error('No bounded card review.');
      const cards=detections.map(({classId,uncertain,box})=>{
        const identity=manifest.classes[classId];
        return {rank:identity.rank,suit:identity.suit,preview:'',
          uncertain,
          region:{x:box.x/width,y:box.y/height,width:box.width/width,height:box.height/height}};
      });
      await session.release(); session=undefined;
      send({id,type:'result',cards,provider,elapsedMs:performance.now()-started});
    } finally { for (const value of Object.values(outputs)) value.dispose(); }
  } catch (error) {
    console.warn('Card detector failed',phase,error instanceof Error?error.message:String(error));
    send({id,type:'error',code:phase});
  } finally { await session?.release().catch(()=>{}); busy=false; }
};
