import {buildRegionPrompt} from './region-edit.js';
export function normalizeConfig(c){let baseUrl=String(c.baseUrl||'').trim().replace(/^export\s+OPENAI_BASE_URL\s*=\s*/i,'').replace(/^["']|["']$/g,'');let key=String(c.key||'').trim().replace(/^export\s+OPENAI_API_KEY\s*=\s*/i,'').replace(/^Bearer\s+/i,'').replace(/^["']|["']$/g,'').trim();let u;try{u=new URL(baseUrl)}catch{throw new Error('请输入完整的 Base URL，例如 https://你的服务/v1。')}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('Base URL 需使用 HTTPS，不要在地址里填写 Key。');u.pathname=u.pathname.replace(/\/(models|images\/edits|chat\/completions)\/?$/,'').replace(/\/+$/,'');baseUrl=u.toString().replace(/\/$/,'');if(!key)throw new Error('Key 输入框为空，请填写第三方服务 Key。');return {...c,baseUrl,key,model:String(c.model||'').trim()}}
function redact(value,key){return String(value||'').split(key).join('[密钥已隐藏]').slice(0,600)}
async function call(url,opts,key,timeout=180000){const timeoutSignal=AbortSignal.timeout(timeout);const signal=opts.signal?AbortSignal.any([opts.signal,timeoutSignal]):timeoutSignal;let r;try{r=await fetch(url,{...opts,mode:'cors',credentials:'omit',redirect:'error',signal})}catch(e){if(opts.signal?.aborted)throw new DOMException('已停止等待','AbortError');throw new Error(e.name==='TimeoutError'?'第三方服务响应超时。':'浏览器无法直接连接第三方服务。请检查服务地址、网络和服务端 CORS；页面不会改用后端转发。')}let data;try{data=await r.json()}catch{throw new Error('第三方服务未返回 JSON（HTTP '+r.status+'），请检查 Base URL。')}if(!r.ok)throw new Error('第三方服务返回 HTTP '+r.status+'：'+redact(data.error?.message||data.message||JSON.stringify(data.error)||'请求失败',key));return data}
export async function getModels(input){const c=normalizeConfig(input),models=new Set(),modelKinds={};let after='',truncated=false;for(let page=0;page<50;page++){const url=new URL(c.baseUrl+'/models');url.searchParams.set('kind','all');if(after)url.searchParams.set('after',after);const data=await call(url.toString(),{headers:{Authorization:'Bearer '+c.key}},c.key,45000);const rows=Array.isArray(data)?data:Array.isArray(data.data)?data.data:Array.isArray(data.models)?data.models:[];rows.forEach(m=>{const id=typeof m==='string'?m:m.id||m.name;if(typeof id==='string'){models.add(id);if(m.kind)modelKinds[id]=m.kind}});if(!data.has_more)break;const next=data.last_id||rows.at(-1)?.id;if(!next||next===after){truncated=true;break}after=next;if(page===49)truncated=true}if(!models.size)throw new Error('第三方服务没有返回可识别的模型列表，可手动填写模型名。');return {models:[...models].sort((a,b)=>(modelKinds[a]==='image'?0:1)-(modelKinds[b]==='image'?0:1)||a.localeCompare(b)),modelKinds,truncated}}
const PROMPT='请根据孩子身份参考照片生成一张完整的约 2:1 横向儿童摄影特色版。输入图片顺序：最前面的 1–3 张照片为同一个孩子的真实身份参考；紧接其后的一张为版面风格参考；若另有额外图片，最后一张为可选的迁移参考图。孩子照片是唯一真实身份依据，五官与身份保持为最高优先级：保留原有脸型轮廓、眉眼形状与间距、眼型、鼻梁与鼻头、嘴唇、耳朵、肤色及年龄特征；不换脸、不混入参考版其他孩子的面孔，不磨皮瘦脸、不放大双眼、不重塑五官。多张照片只用于辨认同一个孩子，不拼接或平均成新面孔；即使姿势、角度和表情变化，也要一眼能认出是同一个孩子。整张设计包含同一个孩子 6–8 个不同的自然美姿，结合站、坐、侧身、转头、手势和表情变化；动作符合孩子年龄，不能通过重复裁切或镜像冒充不同动作。参考版面图的主题配色、大小主次、抠像组合、留白和氛围进行原创设计；安排 1–2 个较大的主人物与其余小人物，自动完成少量简洁中文主题文字和整版排版。不要推测具体姓名、年龄数字、日期；不复制参考图的品牌、商标、卡通 IP 或水印。真实儿童摄影质感，肤质自然、光影一致，人物边缘干净，手脚与肢体结构正确。直接输出一张完整成品图片，不要文字说明。';
export function extractImage(data){const item=data.data?.find?.(x=>x.b64_json||x.url);if(item?.b64_json)return 'data:image/png;base64,'+item.b64_json;if(item?.url)return item.url;const c=data.choices?.[0]?.message;let text='';if(typeof c?.content==='string')text=c.content;else if(Array.isArray(c?.content)){for(const p of c.content){if(p.image_url?.url)return p.image_url.url;if(p.type==='image'&&p.source?.data)return 'data:'+(p.source.media_type||'image/png')+';base64,'+p.source.data;if(p.text)text+=p.text+'\n'}}if(c?.images?.length)return c.images[0].image_url?.url||c.images[0].url;let m=text.match(/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/);if(m)return m[0];m=text.match(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/);return m?.[1]||null}
async function sendImageRequest(input,images,prompt,options={}){
 const c=normalizeConfig(input);if(!c.model)throw new Error('请选择或填写 Model。');if(!images.length)throw new Error('请先上传孩子照片。');options.signal?.throwIfAborted();let response;
 if(c.protocol==='chat'){
  options.onStage?.('waiting');response=await call(c.baseUrl+'/chat/completions',{method:'POST',signal:options.signal,headers:{Authorization:'Bearer '+c.key,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,stream:false,messages:[{role:'user',content:[{type:'text',text:prompt},...images.map(url=>({type:'image_url',image_url:{url}}))]}]})},c.key,300000);
 }else{
  const form=new FormData();form.set('model',c.model);form.set('prompt',prompt);form.set('n','1');if(options.region){form.set('background','opaque');form.set('output_format','png')}
  for(const [i,url] of images.entries()){const blob=await(await fetch(url,{signal:options.signal})).blob();form.append(options.region?'image':'image[]',blob,'reference-'+(i+1)+(blob.type==='image/png'?'.png':'.jpg'))}
  options.onStage?.('waiting');response=await call(c.baseUrl+'/images/edits',{method:'POST',signal:options.signal,headers:{Authorization:'Bearer '+c.key},body:form},c.key,300000);
 }
 const image=extractImage(response);if(!image)throw new Error('该模型未返回图片，请确认模型和生图接口支持参考图生成。');if(!/^data:image\/(png|jpeg|webp);base64,/.test(image)&&!/^https:\/\//.test(image))throw new Error('服务返回的图片地址格式不受支持。');return image;
}
const TRANSFER_DETAILS={
 clothing:'服装迁移：只迁移迁移参考图服装的款式、版型、面料、颜色与层次；对版面中的同一个孩子保持服装统一，不照搬参考图人物。',
 styling:'造型迁移：参考迁移图中的发型、发饰和适龄配件，并在各个人物姿势中保持连贯；不要改变孩子的年龄、脸部比例或五官，配件不得遮挡面部。',
 lighting:'光影迁移：参考迁移图的主光方向、光线软硬、色温和明暗层次；保持整张特色版人物与背景光线统一。',
 background:'背景迁移：参考迁移图的场景、布景、色彩和景深氛围；整版结构、留白和人物层级仍按版面参考图安排。'
};
export function generateImage(input,images,reference,options={}){
 const selected=[...new Set(options.transferCategories||[])].filter(kind=>TRANSFER_DETAILS[kind]);
 const requestImages=[...images,reference];
 let prompt=PROMPT;
 if(options.transferReference&&selected.length){
  requestImages.push(options.transferReference);
  prompt+='\n\n迁移图说明：孩子身份照片之后的第一张图片是版面风格参考，最后一张图片是迁移参考图。只执行用户勾选的项目：\n'+selected.map(kind=>TRANSFER_DETAILS[kind]).join('\n')+'\n迁移参考图只提供以上勾选项目，不用于人物身份。未勾选项目仍遵循孩子原图与版面参考；儿童面部身份始终优先，不能复制迁移图人物的面孔、身材或年龄。';
 }
 const requestOptions={...options};delete requestOptions.transferReference;delete requestOptions.transferCategories;
 return sendImageRequest(input,requestImages,prompt,requestOptions);
}
export function editImage(input,image,instruction,identities=[],options={}){
 if(!instruction.trim())throw new Error('请描述想修改的内容。');
 if(options.mask)throw new Error('请先准备本地选区，再通过坐标提交局部编辑。');
 if(options.region)return sendImageRequest(input,[image],buildRegionPrompt(instruction,options.region),options);
 const prompt='编辑第一张特色版成品。本次用户要求：'+instruction+'。保持未被要求修改的内容和布局不变。后续图片如有，为孩子的真实身份参考。身份保留仅适用于最终保留的人物：保持脸部特征、肤色与年龄，不换脸、不重塑五官。若要求删除人物，不保留或重建被删除对象；若要求换衣、改色或姿势，允许指定内容改变。输出一张完整修改后的图片，不要附带说明。';
 return sendImageRequest(input,[image,...identities],prompt,options);
}
