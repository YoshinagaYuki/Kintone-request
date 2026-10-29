import {validDate,addDays} from './gantt';
import {initialInventoryDates,type InventoryDates} from './date-defaults';
export type IntakeCatalog={items:{id:string;name:string;aliases?:unknown}[];staff:{id:string;name:string}[]};
export type IntakeDraft={staff_id:string;store:string;dates:InventoryDates;lines:{item_id:string;quantity:number}[];warnings:string[];evidence:string[]};
export function redactIntake(text:string){return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[メール省略]').replace(/(?:\+81[- ]?|0)\d{1,4}[-ー ]?\d{1,4}[-ー ]?\d{3,4}/g,'[電話省略]');}
/** Provider output is untrusted: accept only current master IDs and literal source evidence. */
export function validateIntake(raw:unknown,catalog:IntakeCatalog,text:string):IntakeDraft{
 if(!raw||typeof raw!=='object')throw Error('読み取り結果を確認できませんでした。もう一度お試しください');
 const r=raw as Record<string,unknown>,warnings:string[]=[];
 const field=(k:string)=>typeof r[k]==='string'?(r[k] as string).trim():'';
 const date=(k:string)=>{const v=field(k);return validDate(v)&&v>='2000-01-01'&&v<='2100-12-31'?v:'';};
 let start=date('start'),end=date('end'),delivery=date('delivery'),pickup=date('pickup');
 if(!start&&delivery)start=addDays(delivery,1);if(!end&&pickup)end=addDays(pickup,-1);
 const dates=initialInventoryDates(start,end,delivery,pickup);
 if(!start||!end)warnings.push('日程を確認してください。年や月が曖昧な場合は手動で指定してください');
 if(start&&end&&end<start)warnings.push('利用終了が利用開始より前です。日付を修正してください');
 if(delivery&&start&&delivery!==addDays(start,-1))warnings.push('納品日と利用開始日の間隔を確認してください');
 if(pickup&&end&&pickup!==addDays(end,1))warnings.push('集荷日と利用終了日の間隔を確認してください');
 const staff_id=catalog.staff.some(s=>s.id===field('staff_id'))?field('staff_id'):'';
 if(!staff_id)warnings.push('担当者をマスタから選んでください');
 const lines:IntakeDraft['lines']=[];
 for(const v of Array.isArray(r.lines)?r.lines.slice(0,20):[]){if(!v||typeof v!=='object')continue;const l=v as Record<string,unknown>;const item=catalog.items.find(i=>i.id===l.item_id);if(!item){warnings.push('特定できないコンテンツがあります。機器を選んでください');continue;}const quantity=Number.isInteger(l.quantity)&&Number(l.quantity)>=1&&Number(l.quantity)<=100?Number(l.quantity):0;if(!quantity){warnings.push(`${item.name}の台数を確認してください`);lines.push({item_id:item.id,quantity:1});}else lines.push({item_id:item.id,quantity});}
 if(!lines.length)warnings.push('コンテンツをマスタから選んでください');
 const store=field('store').slice(0,200);if(!store)warnings.push('店舗名を入力してください');
 if(Array.isArray(r.warnings))warnings.push(...r.warnings.filter((w):w is string=>typeof w==='string').slice(0,12).map(w=>w.slice(0,200)));
 const evidence=Array.isArray(r.evidence)?r.evidence.filter((s):s is string=>typeof s==='string'&&s.length>0&&s.length<=200&&text.includes(s)).slice(0,12):[];
 return{staff_id,store,dates,lines,warnings:[...new Set(warnings)],evidence};
}
export const intakeSchema={type:'object',properties:{staff_id:{type:'string'},store:{type:'string'},start:{type:'string'},end:{type:'string'},delivery:{type:'string'},pickup:{type:'string'},lines:{type:'array',items:{type:'object',properties:{item_id:{type:'string'},quantity:{type:'integer'}},required:['item_id','quantity']}},warnings:{type:'array',items:{type:'string'}},evidence:{type:'array',items:{type:'string'}}},required:['staff_id','store','start','end','delivery','pickup','lines','warnings','evidence']};
