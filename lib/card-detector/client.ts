import type { DetectedCard } from '../card-recognition';
import type { Provider } from './protocol';
import { ScannerError, workerScan } from './lifecycle';
import { decodePhotoCanvas, PhotoPreparationError } from './photo';

export async function recognizeYoloPhoto(source:string,signal:AbortSignal,progress:(stage:string)=>void):Promise<DetectedCard[]> {
  signal.throwIfAborted();
  const response=await fetch(source,{signal});
  if(!response.ok)throw new PhotoPreparationError('PHOTO_DECODE');
  const canvas=await decodePhotoCanvas(await response.blob(),signal);
  try {
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new PhotoPreparationError('PHOTO_DECODE');
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
  } finally { canvas.width=1;canvas.height=1; }
}
