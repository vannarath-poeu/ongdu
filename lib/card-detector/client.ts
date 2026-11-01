import type { DetectedCard } from '../card-recognition';
import type { Provider } from './protocol';
import { ScannerError, workerScan } from './lifecycle';

export async function recognizeYoloPhoto(source:string,signal:AbortSignal,progress:(stage:string)=>void):Promise<DetectedCard[]> {
  signal.throwIfAborted();
  const image=new Image();image.src=source;
  let cancelDecode:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{
    cancelDecode=()=>{image.src='';reject(signal.reason ?? new DOMException('Cancelled','AbortError'));};
    signal.addEventListener('abort',cancelDecode,{once:true});
  });
  try {await Promise.race([image.decode(),cancelled]);}
  finally {signal.removeEventListener('abort',cancelDecode);}
  signal.throwIfAborted();
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth*image.naturalHeight>16_000_000) throw new ScannerError('NO_CARDS');
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if (!context) throw new ScannerError('NO_CARDS');
  context.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  const forceWasm=new URLSearchParams(window.location.search).get('provider')==='wasm';
  const provider:Provider=!forceWasm && 'gpu' in navigator?'webgpu':'wasm';
  const attempt=(execution:Provider)=>workerScan({width:canvas.width,height:canvas.height,
    rgba:pixels.data.slice().buffer,provider:execution},signal,progress,
    ()=>new Worker(new URL('./recognition.worker.ts',import.meta.url),{type:'module'}));
  let cards:DetectedCard[];
  try { cards=await attempt(provider); }
  catch(error) {
    if (signal.aborted || provider==='wasm' || !(error instanceof ScannerError) || error.code!=='RUNTIME') throw error;
    // Fresh worker and fresh pixels: no detached buffers or GPU session survive fallback.
    cards=await attempt('wasm');
  }
  signal.throwIfAborted();
  return cards.map(card=>{
    if (!card.region) return card;
    const r=card.region, crop=document.createElement('canvas');crop.width=96;crop.height=128;
    crop.getContext('2d')?.drawImage(canvas,r.x*canvas.width,r.y*canvas.height,r.width*canvas.width,r.height*canvas.height,0,0,96,128);
    return {...card,preview:crop.toDataURL('image/jpeg',0.8)};
  });
}
