// Selection geometry is measured against the encoded source, never CSS pixels.
export function selectionBounds(width,height,rgba){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw Error('选区尺寸无效。');
 let left=width,top=height,right=0,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]<255){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1)}
 if(right<=left)throw Error('没有有效选区，请重新涂抹需要修改的位置。');
 return {left,top,right,bottom};
}
export function planRegion(width,height,rgba){
 const bounds=selectionBounds(width,height,rgba),bw=bounds.right-bounds.left,bh=bounds.bottom-bounds.top;
 // Keep context for large/disconnected selections; isolate small subjects.
 const crop=bw<width*.45&&bh<height*.75?{left:Math.max(0,bounds.left-Math.max(48,Math.ceil(bw*.3))),top:Math.max(0,bounds.top-Math.max(48,Math.ceil(bh*.3))),right:Math.min(width,bounds.right+Math.max(48,Math.ceil(bw*.3))),bottom:Math.min(height,bounds.bottom+Math.max(48,Math.ceil(bh*.3)))}:{left:0,top:0,right:width,bottom:height};
 return {sourceWidth:width,sourceHeight:height,bounds,crop,width:crop.right-crop.left,height:crop.bottom-crop.top,selection:{left:bounds.left-crop.left,top:bounds.top-crop.top,right:bounds.right-crop.left,bottom:bounds.bottom-crop.top}};
}
export function buildRegionPrompt(instruction,plan){
 const {width,height,selection:b}=plan;if(!instruction.trim())throw Error('请描述想修改的内容。');
 const cx=(b.left+b.right)/2/width,cy=(b.top+b.bottom)/2/height;
 const position=(cy<1/3?'上方':cy>2/3?'下方':'中部')+(cx<1/3?'左侧':cx>2/3?'右侧':'中央');
 return [`本次任务：对输入的第一张图片做局部编辑。用户要求：${instruction.trim()}`,
 `输入图片实际尺寸：宽 ${width} 像素，高 ${height} 像素。坐标原点在左上角，x 向右增加，y 向下增加。`,
 `用户选区位于${position}。像素范围：x=${b.left}～${b.right}，y=${b.top}～${b.bottom}（右、下边界不包含）。归一化范围：x=${(b.left/width).toFixed(4)}～${(b.right/width).toFixed(4)}，y=${(b.top/height).toFixed(4)}～${(b.bottom/height).toFixed(4)}。`,
 '只对该范围内与用户要求有关的对象做修改，不要选中其他相似的人物或物体。未要求修改的内容保持原样。',
 '要求删除或去除对象时，将该对象完整移除并用周围背景自然填补，不保留或重新生成被删除对象。人物身份保留规则只适用于最终保留的人物。',
 '要求换衣、改色或修改姿势时，允许指定部位按本次任务改变，保留该人物的面部身份及未涉及细节；不要把保留身份理解成禁止修改衣服或姿势。',
 `输出完整输入画幅，保持 ${width}:${height} 的宽高比、位置和缩放，不裁切、不移动主体。输出不透明背景，不添加坐标、标记、边框或说明文字。`].join('\n');
}
// Box blur the edit strengths, then clip them to the exact brush support.
function strengths(mask,width,height,radius){
 const n=width*height,a=new Float32Array(n),tmp=new Float32Array(n),out=new Float32Array(n);
 for(let i=0;i<n;i++)a[i]=(255-mask[i*4+3])/255;
 for(let y=0;y<height;y++){let sum=0;for(let x=0;x<=Math.min(radius,width-1);x++)sum+=a[y*width+x];for(let x=0;x<width;x++){tmp[y*width+x]=sum/(Math.min(width-1,x+radius)-Math.max(0,x-radius)+1);if(x-radius>=0)sum-=a[y*width+x-radius];if(x+radius+1<width)sum+=a[y*width+x+radius+1]}}
 for(let x=0;x<width;x++){let sum=0;for(let y=0;y<=Math.min(radius,height-1);y++)sum+=tmp[y*width+x];for(let y=0;y<height;y++){out[y*width+x]=Math.min(a[y*width+x],sum/(Math.min(height-1,y+radius)-Math.max(0,y-radius)+1));if(y-radius>=0)sum-=tmp[(y-radius)*width+x];if(y+radius+1<height)sum+=tmp[(y+radius+1)*width+x]}}
 return out;
}
export function blendRegionPixels(source,edited,mask,plan,radius=4){
 const {sourceWidth:w,sourceHeight:h,crop,width:cw,height:ch}=plan;
 if(source.length!==w*h*4||mask.length!==source.length||edited.length!==cw*ch*4)throw Error('修改图与选区尺寸不一致。');
 const out=new Uint8ClampedArray(source),strength=strengths(mask,w,h,Math.max(0,Math.min(16,Math.round(radius))));let change=0,weight=0;
 for(let y=crop.top;y<crop.bottom;y++)for(let x=crop.left;x<crop.right;x++){
  const i=y*w+x,t=strength[i];if(t<=0)continue;const s=i*4,e=((y-crop.top)*cw+x-crop.left)*4;
  if(t>.5&&source[s+3]>250&&edited[e+3]<250)throw Error('服务返回的选区含透明空洞，已保留原版本。请重试或缩小选区。');
  for(let c=0;c<4;c++){out[s+c]=Math.round(source[s+c]*(1-t)+edited[e+c]*t);if(c<3)change+=Math.abs(source[s+c]-out[s+c])}weight+=t*3;
 }
 if(!weight||change/weight<.25)throw Error('选区内没有明显变化，已保留原版本。请描述具体修改要求后重试。');
 return out;
}
async function imageOf(url,signal){signal?.throwIfAborted();return new Promise((resolve,reject)=>{const im=new Image();if(url.startsWith('https:'))im.crossOrigin='anonymous';const abort=()=>{im.src='';reject(new DOMException('已停止等待','AbortError'))};signal?.addEventListener('abort',abort,{once:true});const finish=()=>signal?.removeEventListener('abort',abort);im.onload=()=>{finish();resolve(im)};im.onerror=()=>{finish();reject(Error('图片无法读取，服务的结果地址可能不支持跨域。'))};im.src=url})}
function canvas(width,height){const c=document.createElement('canvas');c.width=width;c.height=height;return c}
export async function prepareRegionEdit(sourceUrl,maskUrl,{signal}={}){
 const [source,mask]=await Promise.all([imageOf(sourceUrl,signal),imageOf(maskUrl,signal)]);signal?.throwIfAborted();const w=source.naturalWidth,h=source.naturalHeight;
 if(mask.naturalWidth!==w||mask.naturalHeight!==h)throw Error('选区与原图尺寸不一致，请重新打开编辑器涂抹。');
 const c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);const pixels=ctx.getImageData(0,0,w,h);ctx.clearRect(0,0,w,h);ctx.drawImage(mask,0,0);const maskPixels=ctx.getImageData(0,0,w,h),plan=planRegion(w,h,maskPixels.data);
 const input=canvas(plan.width,plan.height);input.getContext('2d').drawImage(source,plan.crop.left,plan.crop.top,plan.width,plan.height,0,0,plan.width,plan.height);
 return {plan,pixels,maskPixels,image:input.toDataURL('image/png')};
}
export async function composeRegionEdit(prepared,resultUrl,{signal}={}){
 const result=await imageOf(resultUrl,signal);signal?.throwIfAborted();const {plan,pixels,maskPixels}=prepared;
 if(Math.abs((result.naturalWidth/result.naturalHeight)/(plan.width/plan.height)-1)>.03)throw Error('服务返回的画幅比例不符，无法准确合回选区。已保留原版本，请重试。');
 const c=canvas(plan.width,plan.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(result,0,0,c.width,c.height);const edited=ctx.getImageData(0,0,c.width,c.height);
 const out=blendRegionPixels(pixels.data,edited.data,maskPixels.data,plan);signal?.throwIfAborted();const final=canvas(plan.sourceWidth,plan.sourceHeight),f=final.getContext('2d');const image=f.createImageData(final.width,final.height);image.data.set(out);f.putImageData(image,0,0);return final.toDataURL('image/png');
}
