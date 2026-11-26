import {normalizeDate, type KintoneRecord} from './mapper';

export const RENTAL_DATE_FIELDS = ['日付_0','日付_1','納品_日付','集荷_日付'] as const;
export const SHIPPING_DATE_FIELDS = ['納品_日付','集荷_日付'] as const;
const labels:Record<string,string>={'日付_0':'利用開始日','日付_1':'利用最終日','納品_日付':'納品日','集荷_日付':'集荷日'};
export type DateSnapshot=Record<string,string>;
/** Customer dates are date-only values. Never substitute warehouse/transit dates or add offsets here. */
export function requestDateSnapshot(data:Record<string,unknown>,appId:number):DateSnapshot {
  if (appId!==10) return {};
  const date=(raw:unknown,label:string)=>{
    if(raw===null||raw===undefined||raw==='')return '';
    if(typeof raw!=='string')throw Error(`${label}の日付形式を確認してください`);
    const normalized=normalizeDate(raw);
    if(!normalized)throw Error(`${label}の日付形式を確認してください`);
    return normalized;
  };
  const start=data['利用開始日'],end=data['利用最終日'];
  return {'日付_0':date(start,'利用開始日'),'日付_1':date(end,'利用最終日'),
    '納品_日付':data._inventory_delivery_required===false?'':date(data['配送日付'],'納品日'),
    '集荷_日付':data._inventory_pickup_required===false?'':date(data['集荷日付'],'集荷日')};
}
export function recordDateSnapshot(record:Record<string,{value:unknown}>,fields:readonly string[]=RENTAL_DATE_FIELDS):DateSnapshot {
  return Object.fromEntries(fields.map(key=>[key,String(record[key]?.value??'')]));
}
export function applyRequestDates(record:KintoneRecord,expected:DateSnapshot) {
  for(const [key,value]of Object.entries(expected))record[key]={value};
}
export function assertTransferredDates(expected:DateSnapshot,record:Record<string,{value:unknown}>,context:string) {
  const mismatches=Object.entries(expected).filter(([key,date])=>String(record[key]?.value??'')!==date);
  if(mismatches.length)throw Error(`${context}の日付照合に失敗しました：${mismatches.map(([key,date])=>`${labels[key]??key}（申請：${date||'空欄'}／登録先：${String(record[key]?.value??'')||'空欄'}）`).join('、')}。日付を確認してから再試行してください`);
}
