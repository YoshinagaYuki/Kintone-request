import {companyKey,companyName} from './company-name';
import {validDate,addDays} from '../inventory/gantt';
import {tezukuruKitNames} from '../inventory/business';
import {equipmentLabel} from '../allmight-fmt';
export type CompanyRequest={id:string;company_name?:string|null;management_no:string|null;parsed_data:Record<string,unknown>|null;approved_contents?:Record<string,string>|null;form_types:{kintone_app_id:number}|{kintone_app_id:number}[]|null};
export type PortalItem={name:string;quantity:number|null};
export type PortalRow={key:string;managementNo:string;brand:'allmight'|'tezukuru';start:string;end:string;delivery:string;pickup:string;place:string;address:string;items:PortalItem[];materials:PortalItem[];rentalFee:number|null;deliveryFee:number|null;totalFee?:number|null;adjustment?:number|null};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
export const portalMoney=(v:unknown):number|null=>typeof v==='string'||typeof v==='number'?/^\d{1,9}$/.test(String(v).trim())?Number(v):null:null;
const quantity=(v:unknown)=>/^\d{1,6}$/.test(String(v))?Number(v):null;
function grouped(names:string[]):PortalItem[]{const result=new Map<string,number>();for(const n of names)if(n)result.set(n,(result.get(n)||0)+1);return [...result].map(([name,quantity])=>({name,quantity}));}
export function monthBounds(month:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>'2100-12')throw Error('表示月を確認してください');const start=month+'-01',d=new Date(start+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);return {start,end:addDays(d.toISOString().slice(0,10),-1)};}
/** Allowlisted presentation model: no applicant contacts, internal notes, keys or raw JSON. */
export function portalRow(request:CompanyRequest):PortalRow|null{
 const type=Array.isArray(request.form_types)?request.form_types[0]:request.form_types;
 if(!type||![10,49].includes(type.kintone_app_id))return null;
 const tezu=type.kintone_app_id===49,data={...request.parsed_data,...request.approved_contents};
 const delivery=text(data['配送日付']),pickup=text(data['集荷日付']);
 const start=tezu&&!data._portal_kintone?(text(data._inventory_usage_start)||text(data['利用開始日'])||(validDate(delivery)?addDays(delivery,1):'')):text(data['利用開始日']);
 const end=tezu&&!data._portal_kintone?(text(data._inventory_usage_end)||text(data['利用最終日'])||(validDate(pickup)?addDays(pickup,-1):'')):text(data['利用最終日']);
 if(!validDate(start)||!validDate(end)||end<start)return null;
 const names=tezu?(typeof data._portal_kit_label==='string'?(data._portal_kit_label&&!/送付不要/.test(data._portal_kit_label)?[data._portal_kit_label]:[]):tezukuruKitNames(data)):Array.from({length:5},(_,i)=>text(data[equipmentLabel(i+1)])).filter(Boolean);
 const materials=tezu?Array.from({length:10},(_,i)=>({name:text(data[`コンテンツ${i+1}`]),quantity:quantity(data[`数量${i+1}`])})).filter(i=>i.name):[];
 const sourceMoney=(v:unknown)=>typeof v==='string'&&/^-?\d{1,12}(?:\.\d{1,2})?$/.test(v)?Number(v):null;const totalFee=sourceMoney(data._kintone_total),adjustment=sourceMoney(data._kintone_adjustment),deliveryFee=portalMoney(data._approved_delivery_fee??data['配送費']??data['配送料']??data['内）配送料']);const subtotal=sourceMoney(data._kintone_subtotal);
 return {totalFee,adjustment,key:request.id,managementNo:request.management_no||'—',brand:tezu?'tezukuru':'allmight',start,end,delivery:validDate(delivery)?delivery:'',pickup:validDate(pickup)?pickup:'',place:text(data['送付先名'])||text(data['イベントブース名'])||text(data['イベントブース'])||text(data['イベント実施場所'])||'送付先未登録',address:text(data['配送住所']),items:grouped(names),materials,rentalFee:subtotal!==null&&subtotal>=0?subtotal:portalMoney(data._internal_rental_fee),deliveryFee};
}
export function companyRows(requests:CompanyRequest[],key:string,month:string){const {start,end}=monthBounds(month);let undated=0;const rows:PortalRow[]=[];for(const r of requests){if(companyKey(r.company_name||companyName(r.parsed_data??{}))!==key)continue;const row=portalRow(r);if(!row){undated++;continue;}if(row.start<=end&&row.end>=start)rows.push(row);}return{rows:rows.sort((a,b)=>a.start.localeCompare(b.start)||a.place.localeCompare(b.place,'ja')||a.managementNo.localeCompare(b.managementNo,undefined,{numeric:true})),undated};}
export function filterPortalRows(rows:PortalRow[],query='',brand='all'){const q=query.normalize('NFKC').toLowerCase().trim();return rows.filter(r=>(brand==='all'||r.brand===brand)&&(!q||[r.managementNo,r.place,r.address,...r.items.map(i=>i.name),...r.materials.map(i=>i.name)].join(' ').normalize('NFKC').toLowerCase().includes(q)));}
export const portalRowTotal=(r:PortalRow)=>r.totalFee??(r.rentalFee!==null&&r.deliveryFee!==null?r.rentalFee+r.deliveryFee:null);
export function portalTotals(rows:PortalRow[]){const priced=rows.filter(r=>portalRowTotal(r)!==null);return {cases:rows.length,units:rows.reduce((n,r)=>n+r.items.reduce((m,i)=>m+(i.quantity??0),0),0),priced:priced.length,unpriced:rows.length-priced.length,amount:priced.reduce((n,r)=>n+portalRowTotal(r)!,0)};}
const itemText=(items:PortalItem[])=>items.map(i=>`${i.name} × ${i.quantity??'未登録'}`).join(' ／ ');
/** Prefix formula-leading text, quote every cell, and include BOM for Japanese Excel. One case per row prevents fee multiplication. */
export function portalCsv(name:string,month:string,rows:PortalRow[]){const cell=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const fields=[['企業名','対象月','管理番号','事業','利用開始日','利用終了日','納品日','集荷日','送付先名','配送先住所','レンタル品・台数','商品・個数','レンタル・商品代（円）','配送費（円）','調整額（円）','登録金額合計（円）'],...rows.map(r=>[name,month,r.managementNo,r.brand==='allmight'?'オールマイト':'てずくーる',r.start,r.end,r.delivery,r.pickup,r.place,r.address,itemText(r.items),itemText(r.materials),r.rentalFee??'',r.deliveryFee??'',r.adjustment??'',portalRowTotal(r)??''])];return '\ufeff'+fields.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';}
