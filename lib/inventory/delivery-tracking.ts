import type {KintoneRawRecord} from '../kintone/client';
export type DeliveryTracking={carrier:string;number:string;url:string;found:boolean;ambiguous?:boolean};
export function trackingByNumber(records:KintoneRawRecord[]):Record<string,DeliveryTracking>{
 const result:Record<string,DeliveryTracking>={};
 const text=(r:KintoneRawRecord,k:string)=>typeof r[k]?.value==='string'?String(r[k].value).trim():'';
 for(const record of records){
  const key=text(record,'管理番号');if(!key)continue;
  if(result[key]){result[key]={carrier:'',number:'',url:'',found:true,ambiguous:true};continue;}
  let url='';try{const parsed=new URL(text(record,'tracking_url_ship'));if(parsed.protocol==='https:')url=parsed.href;}catch{}
  result[key]={carrier:text(record,'carrier_ship'),number:text(record,'tracking_no_ship'),url,found:true};
 }
 return result;
}
export async function loadDeliveryTracking(numbers:string[],appId:number,find:(app:number,query:string,fields:string[])=>Promise<KintoneRawRecord[]>){
 const unique=[...new Set(numbers.filter(n=>/^\d{1,20}$/.test(n)))];
 const records:KintoneRawRecord[]=[];
 for(let i=0;i<unique.length;i+=50){
  const chunk=unique.slice(i,i+50);
  const found=await find(appId,`管理番号 in (${chunk.map(n=>`"${n}"`).join(',')}) limit 500`,['管理番号','carrier_ship','tracking_no_ship','tracking_url_ship']);
  if(found.length>=500)throw Error('伝票の検索結果が多すぎます。管理番号を確認してください。');
  records.push(...found);
 }
 return trackingByNumber(records);
}
/** Warehouse shipping app is authoritative. Legacy records absent there use their business app. Never mix fields from different shipments. */
export async function loadWarehouseDeliveryTracking(numbers:string[],businessApp:number,shippingApp:number,find:Parameters<typeof loadDeliveryTracking>[2]){
 const [business,warehouse]=await Promise.all([loadDeliveryTracking(numbers,businessApp,find),loadDeliveryTracking(numbers,shippingApp,find)]);
 return {...business,...warehouse};
}
