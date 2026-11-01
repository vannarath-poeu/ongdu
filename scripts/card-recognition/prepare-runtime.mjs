// Deterministic local copy only: no model download, Python, or network during builds.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const version='1.23.2';
const dist=join(root,'node_modules/onnxruntime-web/dist');
const actual=JSON.parse(readFileSync(join(dist,'../package.json'),'utf8')).version;
if(actual!==version) throw new Error(`Expected ONNX Runtime Web ${version}, found ${actual}`);
const target=join(root,'public/onnxruntime',version);
const files=['ort.wasm.min.mjs','ort.webgpu.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'];
mkdirSync(target,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inventory=[];
for(const name of files){
 const source=join(dist,name), destination=join(target,name), bytes=readFileSync(source);
 if(!existsSync(destination)||hash(readFileSync(destination))!==hash(bytes)) copyFileSync(source,destination);
 inventory.push({name,bytes:bytes.length,sha256:hash(bytes)});
}
writeFileSync(join(target,'NOTICE.txt'),`ONNX Runtime Web ${version}\nCopyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the MIT License.\nhttps://github.com/microsoft/onnxruntime/blob/v1.23.2/LICENSE\n`);
writeFileSync(join(target,'assets.json'),JSON.stringify({version,files:inventory},null,2)+'\n');
const model=join(root,'public/models/card-recognition/yolo26n-epoch4-d7f58ee5-single-deck-v1');
const manifest=JSON.parse(readFileSync(join(model,'manifest.json'),'utf8'));
const bytes=readFileSync(join(model,'detector.onnx'));
if(bytes.length!==manifest.assets[0].bytes || hash(bytes)!==manifest.assets[0].sha256) throw new Error('Experimental model asset missing or corrupt.');
console.log(`Verified epoch-4 model and prepared ${files.length} local runtime assets (${version}).`);
