import type { DetectedCard } from '../card-recognition.ts';
import type { ScanRequest, ScanResponse } from './protocol.ts';

export class ScannerError extends Error {
  readonly code: 'ASSET'|'RUNTIME'|'NO_CARDS'|'TIMEOUT';
  constructor(code: 'ASSET'|'RUNTIME'|'NO_CARDS'|'TIMEOUT') { super(code); this.code=code; }
}

export function workerScan(request: Omit<ScanRequest,'id'>, signal: AbortSignal, progress:(stage:string)=>void,
    createWorker:()=>Worker):Promise<DetectedCard[]> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const worker=createWorker();
    const id=crypto.randomUUID();
    let settled=false;
    let timer:ReturnType<typeof setTimeout>;
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();};
    const finish=(error?:unknown,cards?:DetectedCard[])=>{
      if (settled) return;
      settled=true;cleanup();
      if (error) reject(error); else resolve(cards!);
    };
    const abort=()=>finish(signal.reason ?? new DOMException('Cancelled','AbortError'));
    const deadline=(ms:number)=>{clearTimeout(timer);timer=setTimeout(()=>finish(new ScannerError('TIMEOUT')),ms);};
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>finish(new ScannerError('RUNTIME'));
    worker.onmessageerror=()=>finish(new ScannerError('RUNTIME'));
    worker.onmessage=({data}:MessageEvent<ScanResponse>)=>{
      if (data.id!==id || signal.aborted || settled) return;
      if (data.type==='progress') {
        progress(data.stage==='loading'?'Loading card reader…':'Reading your cards…');
        if (data.stage==='reading') deadline(30_000);
      } else if (data.type==='result') finish(undefined,data.cards);
      else if (data.type==='error') finish(new ScannerError(data.code));
    };
    deadline(60_000);
    if (signal.aborted) {abort();return;}
    try {worker.postMessage({...request,id},[request.rgba]);} catch(error) {finish(error);}
  });
}
