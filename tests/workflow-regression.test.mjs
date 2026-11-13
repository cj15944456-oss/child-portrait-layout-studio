import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=process.env.PROJECT_ROOT||path.resolve(here,'..');
const providerSource=readFileSync(path.join(root,'ui/provider.js'),'utf8');
const provider=await import('data:text/javascript;base64,'+Buffer.from(providerSource).toString('base64'));

test('layout generation sends child, layout, and selected migration references directly to the gateway',async()=>{
 const originalFetch=globalThis.fetch;
 const child='data:image/jpeg;base64,Y2hpbGQ=';
 const layout='data:image/jpeg;base64,bGF5b3V0';
 const migration='data:image/jpeg;base64,bWlncmF0aW9u';
 let submitted;
 globalThis.fetch=async(url,options)=>{
  submitted={url:String(url),options};
  return Response.json({data:[{b64_json:'Z2VuZXJhdGVk'}]});
 };
 try{
  const result=await provider.generateImage(
   {baseUrl:'https://gateway.example/v1',key:'test-key',model:'image-model',protocol:'chat'},
   [child],layout,
   {transferReference:migration,transferCategories:['clothing','lighting']}
  );
  assert.equal(result,'data:image/png;base64,Z2VuZXJhdGVk');
  assert.equal(new URL(submitted.url).host,'gateway.example');
  assert.equal(submitted.url,'https://gateway.example/v1/chat/completions');
  const body=JSON.parse(submitted.options.body);
  const content=body.messages[0].content;
  const images=content.filter(part=>part.type==='image_url').map(part=>part.image_url.url);
  assert.deepEqual(images,[child,layout,migration]);
  const prompt=content.find(part=>part.type==='text').text;
  assert.match(prompt,/服装迁移/);
  assert.match(prompt,/光影迁移/);
  assert.doesNotMatch(prompt,/背景迁移/);
 }finally{
  globalThis.fetch=originalFetch;
 }
});

test('generation task reaches the provider without depending on a nonexistent busy element',async()=>{
 const appSource=readFileSync(path.join(root,'ui/app.js'),'utf8');
 const start=appSource.indexOf('async function runJob(job){');
 const end=appSource.indexOf("\n$('cancelTask')",start);
 assert.notEqual(start,-1,'runJob should exist in the app source');
 assert.notEqual(end,-1,'runJob boundary should remain identifiable');
 const elements=new Map();
 for(const id of ['taskPanel','taskTrack','taskTitle','taskDetail','cancelTask','retryTask','error']){
  elements.set(id,{textContent:'',className:'',disabled:false,classList:{add(){},remove(){},toggle(){}}});
 }
 const calls=[];
 const sandbox={
  $:id=>elements.get(id)||null,
  document:{title:'特色版工作台',hidden:false},
  generating:false,startedAt:0,taskStage:'preparing',taskTimer:null,
  lastJob:null,controller:null,originalTitle:'特色版工作台',
  unlockAudio:async()=>{},historyReady:Promise.resolve(),
  AbortController,setInterval:()=>1,clearInterval:()=>{},
  lockTask:()=>{},updateElapsed:()=>{},changeStage:()=>{},
  generateImage:async(...args)=>{calls.push(args);return 'data:image/png;base64,aGVsbG8='},
  editImage:async()=>{throw new Error('editImage should not be called')},
  addVersion:async()=>{},completeFeedback:()=>{}
 };
 vm.runInNewContext(appSource.slice(start,end)+'\nglobalThis.__runJob=runJob;',sandbox);
 const job={
  kind:'generate',config:{model:'image-model'},images:['child-image'],reference:'layout-image',
  transferReference:'migration-image',transferCategories:['clothing']
 };
 await sandbox.__runJob(job);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],job.config);
 assert.deepEqual(Array.from(calls[0][1]),job.images);
 assert.equal(calls[0][2],job.reference);
 assert.equal(calls[0][3].transferReference,job.transferReference);
 assert.deepEqual(Array.from(calls[0][3].transferCategories),job.transferCategories);
});
