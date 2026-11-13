export function buildCopyInstruction({headline='',subline='',notes=''}={}){
 const changes=[];
 if(headline.trim())changes.push(`主标题逐字替换为「${headline.trim()}」。`);
 if(subline.trim())changes.push(`副标题或落款逐字替换为「${subline.trim()}」。`);
 if(notes.trim())changes.push(`其他文案要求：${notes.trim()}`);
 return [
  '仅修改当前特色版成品中的设计文案。不要改孩子的面部身份、人物姿势、服装、背景、版式结构或整体配色。',
  changes.join(' '),
  '用户提供的中文必须原样呈现，不要增删字、改写、补充日期或添加其他文字。未填写的主标题或副标题尽量保留原样。'
 ].filter(Boolean).join('\n');
}

export function buildPaletteInstruction({color,colorName='自定义底色',mood='奶油柔和',notes=''}={}){
 return [
  `只调整当前特色版的背景底色与协调配色。背景底色指定为${colorName}（${color}），整体配色氛围为${mood}。`,
  '可以协调背景中的装饰色、边框色和文字装饰色，使画面统一、柔和、有层次；不要改孩子的面部身份、肤色、服装、姿势、人物比例、文字内容或版式结构。保持人物边缘自然，背景与人物光线协调。',
  notes.trim()?`补充要求：${notes.trim()}`:''
 ].filter(Boolean).join('\n');
}
