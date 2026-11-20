import type{KintoneRawRecord}from'../kintone/client';
import type{CompanyRequest}from'./report';import{companyKey}from'./company-name';
const value=(r:KintoneRawRecord,k:string)=>typeof r[k]?.value==='string'?r[k].value as string:'';
export const portalKintoneFields=(app:number)=>['$id','管理番号','文字列__1行__1','日付_0','日付_1','納品_日付','集荷_日付','イベント実施場所','納品_住所','配送費','計算','調整額','レンタル機材',...(app===10?['レンタル機材_0','レンタル機材_1','レンタル機材_3','レンタル機材_2','利用金額','利用金額_0','利用金額_1','利用金額_3','利用金額_2']:Array.from({length:10},(_,i)=>i?`コンテンツ_${i-1}`:'コンテンツ').concat(Array.from({length:10},(_,i)=>i?`数値_${i-1}`:'数値')).concat(['数値_9','数値_10','数値_11','数値_21','数値_20','数値_19','数値_18','数値_17','数値_16','数値_15','数値_14']))];
/** Only allowlisted display fields leave the kintone adapter. No contacts or notes. */
export function kintoneCompanyRequest(app:10|49,r:KintoneRawRecord):CompanyRequest{
 const priceFields=app===10?['利用金額','利用金額_0','利用金額_1','利用金額_3','利用金額_2']:['数値_9','数値_10','数値_11','数値_21','数値_20','数値_19','数値_18','数値_17','数値_16','数値_15','数値_14'];const money=(k:string)=>/^[-]?\d+(?:\.\d{1,2})?$/.test(value(r,k))?Number(value(r,k)):null;const hasPrice=priceFields.some(k=>money(k)!==null)||money('配送費')!==null;const subtotal=hasPrice?priceFields.reduce((n,k)=>n+(money(k)??0),0):null;const delivery=hasPrice?(money('配送費')??0):null,adjustment=hasPrice?(money('調整額')??0):null;const total=hasPrice?(app===10?money('計算'):null)??(subtotal!+delivery!-adjustment!):null;
 const data:Record<string,unknown>={_portal_kintone:true,'企業名':value(r,'文字列__1行__1'),'利用開始日':value(r,'日付_0'),'利用最終日':value(r,'日付_1'),'配送日付':value(r,'納品_日付'),'集荷日付':value(r,'集荷_日付'),'送付先名':value(r,'イベント実施場所'),'配送住所':value(r,'納品_住所'),'配送費':delivery===null?'':String(delivery),_kintone_subtotal:subtotal===null?'':String(subtotal),_kintone_total:total===null?'':String(total),_kintone_adjustment:adjustment===null?'':String(adjustment)};
 if(app===10)['レンタル機材','レンタル機材_0','レンタル機材_1','レンタル機材_3','レンタル機材_2'].forEach((k,i)=>data[`機器商品${'①②③④⑤'[i]}`]=value(r,k));
 else{data['レンタルプラン']=value(r,'レンタル機材');data._portal_kit_label=value(r,'レンタル機材');for(let i=0;i<10;i++){data[`コンテンツ${i+1}`]=value(r,i?`コンテンツ_${i-1}`:'コンテンツ');data[`数量${i+1}`]=value(r,i?`数値_${i-1}`:'数値');}}
 return{id:`kintone:${app}:${value(r,'$id')}`,company_name:value(r,'文字列__1行__1'),management_no:value(r,'管理番号'),parsed_data:data,form_types:{kintone_app_id:app}};
}
export function requestApp(r:CompanyRequest){const f=Array.isArray(r.form_types)?r.form_types[0]:r.form_types;return f?.kintone_app_id;}
const identity=(r:CompanyRequest)=>{const no=r.management_no?.normalize('NFKC').trim();return no?`${requestApp(r)}:${no}`:`id:${r.id}`;};
/** Merge before company filtering, so a moved company cannot expose a stale local case. */
export function mergeCompanyRequests(local:CompanyRequest[],remote:CompanyRequest[]){
 const locals=new Map(local.map(r=>[identity(r),r]));const result=new Map(local.map(r=>[identity(r),r]));
 for(const r of remote){const key=identity(r),prior=locals.get(key),sameCompany=prior&&companyKey(prior.company_name??'')===companyKey(r.company_name??'');const data={...r.parsed_data};if(sameCompany&&prior.parsed_data?._internal_rental_fee!==undefined)data._internal_rental_fee=prior.parsed_data._internal_rental_fee;result.set(key,{...r,parsed_data:data});}
 return[...result.values()];
}
