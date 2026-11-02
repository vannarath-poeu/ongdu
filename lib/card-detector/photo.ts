export const MAX_PHOTO_EDGE = 1600;
export const MAX_PHOTO_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 220_000_000;
export type PhotoErrorCode = 'PHOTO_TOO_LARGE' | 'PHOTO_DECODE' | 'PHOTO_PREPARE_TIMEOUT';
export class PhotoPreparationError extends Error {
  readonly code: PhotoErrorCode;
  constructor(code: PhotoErrorCode) { super(code); this.code = code; }
}
export interface PhotoHeader { width: number; height: number; orientation: number }

function exifOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) return 1;
  const little = view.getUint16(0) === 0x4949;
  if ((!little && view.getUint16(0) !== 0x4d4d) || view.getUint16(2,little) !== 42) return 1;
  const offset = view.getUint32(4,little);
  if (offset + 2 > bytes.length) return 1;
  const count = view.getUint16(offset,little);
  for (let i=0; i<count; i++) {
    const entry = offset + 2 + i*12;
    if (entry + 12 > bytes.length) break;
    if (view.getUint16(entry,little) === 0x112 && view.getUint16(entry+2,little) === 3 && view.getUint32(entry+4,little) === 1) {
      const value = view.getUint16(entry+8,little);
      return value>=1 && value<=8 ? value : 1;
    }
  }
  return 1;
}

// Read bounded metadata, not full-resolution pixels, before asking the decoder to resize.
export function readPhotoHeader(bytes: Uint8Array): PhotoHeader | null {
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (bytes.length>=24 && view.getUint32(0)===0x89504e47 && view.getUint32(4)===0x0d0a1a0a) {
    return {width:view.getUint32(16),height:view.getUint32(20),orientation:1};
  }
  if (bytes.length<4 || view.getUint16(0)!==0xffd8) return null;
  let width=0,height=0,orientation=1,offset=2;
  while (offset+4<=bytes.length) {
    if (bytes[offset++]!==0xff) break;
    while (offset<bytes.length && bytes[offset]===0xff) offset++;
    const marker=bytes[offset++];
    if (marker===0xda || marker===0xd9) break;
    if (marker===0x01 || (marker>=0xd0 && marker<=0xd8)) continue;
    if (offset+2>bytes.length) break;
    const length=view.getUint16(offset);
    if (length<2 || offset+length>bytes.length) break;
    const start=offset+2;
    if (marker===0xe1 && length>=8 && view.getUint32(start)===0x45786966 && view.getUint16(start+4)===0) {
      orientation=exifOrientation(bytes.subarray(start+6,offset+length));
    }
    if (marker>=0xc0 && marker<=0xcf && ![0xc4,0xc8,0xcc].includes(marker) && length>=8) {
      height=view.getUint16(start+1);width=view.getUint16(start+3);
    }
    offset+=length;
  }
  return width && height ? {width,height,orientation} : null;
}

export function photoDimensions(width:number,height:number): {width:number;height:number} {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1) throw new PhotoPreparationError('PHOTO_DECODE');
  if (width*height>MAX_SOURCE_PIXELS) throw new PhotoPreparationError('PHOTO_TOO_LARGE');
  const scale=Math.min(1,MAX_PHOTO_EDGE/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

export interface PhotoEnvironment {
  bitmap?: (blob:Blob,options:ImageBitmapOptions)=>Promise<ImageBitmap>;
  image: ()=>HTMLImageElement;
  canvas: ()=>HTMLCanvasElement;
  objectURL: (blob:Blob)=>string;
  revokeURL: (url:string)=>void;
}
function browserEnvironment():PhotoEnvironment {
  return {bitmap:typeof createImageBitmap==='function' ? (blob,options)=>createImageBitmap(blob,options) : undefined,
    image:()=>new Image(),canvas:()=>document.createElement('canvas'),
    objectURL:blob=>URL.createObjectURL(blob),revokeURL:url=>URL.revokeObjectURL(url)};
}

function abortable<T>(promise:Promise<T>,signal:AbortSignal,late?:(value:T)=>void,onAbort?:()=>void):Promise<T> {
  return new Promise((resolve,reject)=>{
    let done=false;
    const abort=()=>{if(done)return;done=true;signal.removeEventListener('abort',abort);onAbort?.();reject(signal.reason ?? new DOMException('Cancelled','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{if(done){late?.(value);return;}done=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(done)return;done=true;signal.removeEventListener('abort',abort);reject(error);});
    if(signal.aborted)abort();
  });
}

function paint(source:CanvasImageSource,width:number,height:number,env:PhotoEnvironment):HTMLCanvasElement {
  const size=photoDimensions(width,height),canvas=env.canvas();canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new PhotoPreparationError('PHOTO_DECODE');
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(source,0,0,canvas.width,canvas.height);
  return canvas;
}

export async function decodePhotoCanvas(blob:Blob,signal:AbortSignal,env:PhotoEnvironment=browserEnvironment()):Promise<HTMLCanvasElement> {
  signal.throwIfAborted();
  if(blob.size>MAX_PHOTO_BYTES)throw new PhotoPreparationError('PHOTO_TOO_LARGE');
  const header=readPhotoHeader(new Uint8Array(await blob.slice(0,256*1024).arrayBuffer()));signal.throwIfAborted();
  let size: {width:number;height:number}|undefined;
  if(header){const swap=header.orientation>=5;size=photoDimensions(swap?header.height:header.width,swap?header.width:header.height);}
  if(env.bitmap){
    let bitmap:ImageBitmap|undefined;
    try{
      bitmap=await abortable(env.bitmap(blob,{imageOrientation:'from-image',resizeQuality:'high',...(size?{resizeWidth:size.width,resizeHeight:size.height}:{})}),signal,value=>value.close());
      signal.throwIfAborted();return paint(bitmap,bitmap.width,bitmap.height,env);
    }catch(error){signal.throwIfAborted();if(error instanceof PhotoPreparationError)throw error;}
    finally{bitmap?.close();}
  }
  // Native image-element fallback for browsers/formats without bitmap resize support.
  const image=env.image(),url=env.objectURL(blob);
  try{
    image.src=url;await abortable(image.decode(),signal,undefined,()=>{image.src='';});signal.throwIfAborted();
    return paint(image,image.naturalWidth,image.naturalHeight,env);
  }catch(error){signal.throwIfAborted();if(error instanceof PhotoPreparationError)throw error;throw new PhotoPreparationError('PHOTO_DECODE');}
  finally{image.src='';env.revokeURL(url);}
}

// Encoding is asynchronous; release the pixel buffer even after cancellation or failure.
export async function encodePhotoCanvas(canvas:HTMLCanvasElement,signal:AbortSignal):Promise<Blob> {
  try {
    signal.throwIfAborted();
    return await abortable(new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new PhotoPreparationError('PHOTO_DECODE')),'image/jpeg',.92)),signal);
  } finally { canvas.width=1;canvas.height=1; }
}

export async function preparePhotoUpload(blob:Blob,signal:AbortSignal,env:PhotoEnvironment=browserEnvironment()):Promise<Blob> {
  const canvas=await decodePhotoCanvas(blob,signal,env);
  try{
    // Preserve original small JPEG/PNG pixels to avoid unnecessary lossy recompression.
    const header=readPhotoHeader(new Uint8Array(await blob.slice(0,256*1024).arrayBuffer()));signal.throwIfAborted();
    if(header?.orientation===1 && header.width===canvas.width && header.height===canvas.height && ['image/jpeg','image/png'].includes(blob.type))return blob;
    return await encodePhotoCanvas(canvas,signal);
  }finally{canvas.width=1;canvas.height=1;}
}
