import{occupiedCycle}from'./occupied-cycle';
import {validDate} from './gantt';
import {stockOn} from './board';
import type {InventoryModel,InventoryRecord} from './model';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function manualConfirmation(body:Record<string,unknown>){
 if(!['hold','registered'].includes(body.status as string))throw Error('仮押さえ・本確定を選択してください');
 const managementNo=typeof body.managementNo==='string'?body.managementNo.normalize('NFKC').trim():'';
 if(body.status==='registered'&&!/^\d{1,20}$/.test(managementNo))throw Error('本確定には管理番号を数字で入力してください');
 return{status:body.status as 'hold'|'registered',managementNo:body.status==='registered'?managementNo:''};
}
export function bookingPatch(body:Record<string,unknown>){
 if(!uuid(body.item_id))throw Error('商品を選択してください');const patch:Record<string,string>={item_id:body.item_id};
 for(const k of ['staff','store'] as const){if(typeof body[k]!=='string'||!(body[k] as string).trim()||(body[k] as string).length>200)throw Error('担当者・店舗名を入力してください');patch[k]=(body[k] as string).trim();}
 for(const k of ['start','end','from','to'] as const){if(!validDate(body[k])||(body[k] as string)<'2000-01-01'||(body[k] as string)>'2100-12-31')throw Error('利用・確保期間を確認してください');patch[k]=body[k] as string;}
 for(const k of ['delivery','pickup'] as const){if(body[k]!==''&&!validDate(body[k]))throw Error('配送・集荷日を確認してください');patch[k]=body[k] as string;}
 if(patch.end<patch.start||patch.to<patch.from||[patch.start,patch.end,patch.delivery,patch.pickup].filter(Boolean).some(d=>d<patch.from||d>patch.to))throw Error('確保期間には利用・配送・集荷日をすべて含めてください');return patch;
}
export function unitNumber(value:unknown){if(value===null||value==='')return null;if(!Number.isInteger(value)||(value as number)<1||(value as number)>250)throw Error('番号は1〜250から選択してください');return value as number;}
export function resolveUnitNumber(model:InventoryModel,r:InventoryRecord,value:unknown,existing=model.records){
 if(value!=='auto')return unitNumber(value);
 const item=model.items.find(i=>i.id===r.itemId);if(!item)throw Error('有効な商品を選択してください');
 for(let n=1;n<=250;n++){try{validateNumber(model,r,n);}catch{continue;}if(!existing.some(other=>other.itemId===r.itemId&&other.booking.group!==r.booking.group&&other.booking.unitNumber===n&&occupiedCycle(other.booking).from<=occupiedCycle(r.booking).to&&occupiedCycle(r.booking).from<=occupiedCycle(other.booking).to))return n;}
 throw Error('確保期間を通して空いている番号がありません。日程を調整するか未割当を選択してください');
}
export function validateNumber(model:InventoryModel,r:InventoryRecord,n:number|null){if(n===null)return;const item=model.items.find(i=>i.id===r.itemId);if(!item)throw Error('有効な商品を選択してください');const cycle=occupiedCycle(r.booking);const checks=[cycle.from,...(item.schedule??[]).filter(s=>cycle.from<=s.effective_date&&s.effective_date<=cycle.to).map(s=>s.effective_date)];if(checks.some(d=>n>(stockOn(item,d)?.usable??0)))throw Error('この番号は確保期間中に予備・対象外になります');}
export function slotSchedule(records:InventoryRecord[]){return records.filter(r=>!r.deleted&&r.booking.unitNumber!=null).map(r=>({item_id:r.itemId,unit_number:r.booking.unitNumber,group_key:r.booking.group,occupied_from:occupiedCycle(r.booking).from,occupied_to:occupiedCycle(r.booking).to}));}
export function holdBatchInput(body:Record<string,unknown>){
 if(!uuid(body.batch_id)||!uuid(body.staff_id))throw Error('担当者を選択してください');
 const patch=bookingPatch({item_id:(body.lines as any[])?.[0]?.item_id,staff:'担当者',store:body.store_name,start:body.start,end:body.end,from:body.from,to:body.to,delivery:body.delivery??'',pickup:body.pickup??''});
 if(!Array.isArray(body.lines)||body.lines.length<1||body.lines.length>20)throw Error('商品を1〜20行で指定してください');const lines=body.lines.map((line:any)=>{if(!uuid(line.item_id)||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>100)throw Error('商品・台数を確認してください');if(!Array.isArray(line.numbers)||line.numbers.length!==line.quantity)throw Error('台数分の番号を指定してください（未割当も選択できます）');if(!Number.isInteger(line.screen_quantity??0)||(line.screen_quantity??0)<0||(line.screen_quantity??0)>line.quantity)throw Error('背景スクリーンは貸出機器の台数以下で指定してください');return {item_id:line.item_id,quantity:line.quantity,screen_quantity:line.screen_quantity??0,numbers:line.numbers.map((n:unknown)=>n==='auto'?'auto' as const:unitNumber(n))};});if(lines.reduce((n,l)=>n+l.quantity,0)>100)throw Error('一度の仮押さえは100台までです');if(typeof body.note!=='string'||body.note.length>2000)throw Error('備考は2000文字までです');return {batch_id:body.batch_id,staff_id:body.staff_id,patch,lines,note:body.note,...manualConfirmation({status:body.status??'hold',managementNo:body.managementNo??''})};
}
