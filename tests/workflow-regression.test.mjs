import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=process.env.PROJECT_ROOT||path.resolve(here,'..');
const providerSource=readFileSync(path.join(root,'ui/provider.js'),'utf8');
const provider=await import(pathToFileURL(path.join(root,'ui/provider.js')).href);
const designSource=readFileSync(path.join(root,'ui/design-edits.js'),'utf8');
const designEdits=await import('data:text/javascript;base64,'+Buffer.from(designSource).toString('base64'));

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

test('copy and background palette dialogs build scoped edit instructions',()=>{
 const html=readFileSync(path.join(root,'ui/index.html'),'utf8');
 const sw=readFileSync(path.join(root,'ui/sw.js'),'utf8');
 for(const id of ['copyDesignDialog','designHeadline','designSubline','paletteDesignDialog','backgroundColor','paletteMood','brushToolForm']){
  assert.ok(html.includes('id="'+id+'"'));
 }
 assert.match(sw,/\.\/design-edits\.js/);
 const copy=designEdits.buildCopyInstruction({headline:'初见星河',subline:'满月纪念',notes:'保留原字体位置'});
 assert.match(copy,/主标题逐字替换为「初见星河」/);
 assert.match(copy,/副标题或落款逐字替换为「满月纪念」/);
 assert.match(copy,/不要改孩子的面部身份/);
 const palette=designEdits.buildPaletteInstruction({color:'#DEE8F0',colorName:'雾霾蓝',mood:'清新通透',notes:'装饰色用浅金色'});
 assert.match(palette,/雾霾蓝（#DEE8F0）/);
 assert.match(palette,/整体配色氛围为清新通透/);
 assert.match(palette,/装饰色用浅金色/);
 assert.match(palette,/不要改孩子的面部身份/);
});

test('focused edit dialogs submit the current design through the edit job flow',async()=>{
 const appSource=readFileSync(path.join(root,'ui/app.js'),'utf8');
 const start=appSource.indexOf('async function startFocusedEdit(');
 const end=appSource.indexOf("\n$('copyDesignButton')",start);
 assert.notEqual(start,-1,'focused edit submission should exist');
 assert.notEqual(end,-1,'focused edit submission boundary should remain identifiable');
 const error={textContent:''};
 const dialog={closed:false,close(){this.closed=true}};
 let submitted;
 const sandbox={
  $:id=>id==='copyDesignDialog'?dialog:id==='copyDesignError'?error:null,
  generating:false,currentVersion:{url:'current-layout.png'},config:{model:'image-model'},photos:[],
  saveForm(){},unlockAudio:async()=>{},blobData:async()=>null,dataImage:()=>null,
  runJob:job=>{submitted=job}
 };
 vm.runInNewContext(appSource.slice(start,end)+'\nglobalThis.__startFocusedEdit=startFocusedEdit;',sandbox);
 await sandbox.__startFocusedEdit('Replace the title','copyDesignDialog','copyDesignError');
 assert.equal(dialog.closed,true);
 assert.equal(submitted.kind,'edit');
 assert.equal(submitted.image,'current-layout.png');
 assert.equal(submitted.instruction,'Replace the title');
 assert.equal(submitted.config.model,'image-model');
});

test('brush selection is enabled for both coordinate-capable API protocols',()=>{
 const appSource=readFileSync(path.join(root,'ui/app.js'),'utf8');
 const start=appSource.indexOf('function setBrush(on){');
 const end=appSource.indexOf('\nfunction setZoom',start);
 assert.notEqual(start,-1,'brush control should exist in the app source');
 assert.notEqual(end,-1,'brush control boundary should remain identifiable');
 const makeElement=value=>{const classes=new Set(),element={value,textContent:'',attributes:{},classes};element.classList={toggle:(name,on)=>on?classes.add(name):classes.delete(name),add:name=>classes.add(name),remove:name=>classes.delete(name)};element.setAttribute=(name,value)=>{element.attributes[name]=value};return element};
 const elements=new Map([
  ['protocol',makeElement('chat')],['editorError',makeElement()],
  ['editStage',makeElement()],['viewTool',makeElement()],['brushTool',makeElement()],['brushToolForm',makeElement()]
 ]);
 const sandbox={brushMode:false,$:id=>elements.get(id),drawSelection:()=>{}};
 vm.runInNewContext(appSource.slice(start,end)+'\nglobalThis.__setBrush=setBrush;',sandbox);
 sandbox.__setBrush(true);
 assert.equal(sandbox.brushMode,true);
 assert.equal(elements.get('editorError').textContent,'');
 elements.get('protocol').value='edits';
 sandbox.__setBrush(true);
 assert.equal(sandbox.brushMode,true);
 assert.equal(elements.get('brushToolForm').attributes['aria-pressed'],'true');
 assert.equal(elements.get('brushToolForm').textContent,'正在涂抹 · 点击结束');
 assert.equal(elements.get('editStage').classes.has('selecting'),true);
});


for(const scenario of ['composite failure','cancel after model response'])test('region job preserves history on '+scenario,async()=>{
 const app=readFileSync(path.join(root,'ui/app.js'),'utf8'),start=app.indexOf('async function runJob(job){'),end=app.indexOf("\n$('cancelTask')",start);let saved=0,composed=0;
 const el=()=>({textContent:'',className:'',classList:{add(){},remove(){}}});const elements=new Map();const sandbox={
  $:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)},document:{title:'workbench',hidden:false},generating:false,controller:null,originalTitle:'workbench',
  unlockAudio:async()=>{},historyReady:Promise.resolve(),AbortController,setInterval:()=>1,clearInterval(){},lockTask(){},updateElapsed(){},changeStage(){},completeFeedback(){},
  prepareRegionEdit:async()=>({image:'cropped',plan:{width:20,height:20}}),
  editImage:async(config,image,instruction,identities,options)=>{assert.equal(image,'cropped');assert.equal(identities.length,0);assert.equal(options.mask,undefined);assert.equal(options.region.width,20);if(scenario.startsWith('cancel'))sandbox.controller.abort();return 'provider-output'},
  composeRegionEdit:async()=>{composed++;throw Error('returned aspect ratio invalid')},addVersion:async()=>{saved++}
 };
 vm.runInNewContext(app.slice(start,end)+'\nglobalThis.run=runJob;',sandbox);await sandbox.run({kind:'edit',mask:'local-mask',image:'source',instruction:'remove',config:{},identities:['identity']});
 assert.equal(saved,0);assert.equal(sandbox.generating,false);assert.equal(composed,scenario.startsWith('cancel')?0:1);
});
