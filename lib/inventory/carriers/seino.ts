import {load} from 'cheerio';
import {addDays,validDate} from '../gantt';
export type CarrierCheck={delivered:boolean;status:string;number:string;acceptedDate?:string};
export function seinoNumber(value:string){const number=value.replace(/[-\s]/g,'');return /^\d{10}$/.test(number)?number:null;}
/** Only the exact shipment's result cell counts. Navigation, examples and other parcels never count. */
export function parseSeinoResult(html:string,number:string,deliveryDate:string):CarrierCheck{
 const unknown={delivered:false,status:'追跡結果を確認できませんでした',number};
 if(!/^\d{10}$/.test(number)||!validDate(deliveryDate))return unknown;
 const $=load(html);$('script,style,noscript').remove();
 const table=$('table.kakuNinKenSaku[summary="お届け状況確認 検索"]');if(table.length!==1)return unknown;
 const matching=table.find('tr').toArray().filter(row=>$(row).children('td.col3').text().replace(/\s/g,'')===number);
 if(matching.length!==1)return unknown;
 const row=$(matching[0]),statusCell=row.children('td.col4').clone();statusCell.find('a,button,input').remove();const status=statusCell.text().replace(/\s/g,'');
 const accepted=row.children('td.col2').text().replace(/\s/g,'').match(/^(\d{1,2})月(\d{1,2})日$/);
 if(!accepted)return unknown;
 const year=Number(deliveryDate.slice(0,4));
 const dates=[year-1,year,year+1].map(y=>`${y}-${accepted[1].padStart(2,'0')}-${accepted[2].padStart(2,'0')}`).filter(d=>validDate(d)&&d>=addDays(deliveryDate,-30)&&d<=addDays(deliveryDate,7));
 if(dates.length!==1)return unknown;
 const delivered=status==='配達済みです';
 const pendingStatus=status.replace(/^現在地はコチラ/,'');
 const safeStatus=delivered?'配達済み':pendingStatus==='現在配達中です'?'配達中':pendingStatus==='配達店に到着しています'?'配達店到着':/^(受付|集荷|輸送中|配達中|持出中|保管中|配達店到着|配達予定)/.test(status)&&status.length<=60?status:'追跡結果を確認できませんでした';
 return {delivered,status:safeStatus,number,acceptedDate:dates[0]};
}
export async function checkSeino(number:string,date:string,fetcher:typeof fetch=fetch):Promise<CarrierCheck>{
 if(!/^\d{10}$/.test(number))throw Error('伝票番号の形式を確認してください');
 let url=`https://track.seino.co.jp/cgi-bin/gnpquery.pgm?GNPNO1=${number}`;
 const signal=AbortSignal.timeout(10000);
 for(let i=0;i<4;i++){
  const response=await fetcher(url,{cache:'no-store',redirect:'manual',signal});
  if(response.status>=300&&response.status<400){const next=new URL(response.headers.get('location')??'',url);if(next.origin!=='https://track.seino.co.jp')throw Error('配送状況を確認できませんでした');url=next.href;continue;}
  if(!response.ok||!(response.headers.get('content-type')??'').includes('text/html'))throw Error('配送状況を確認できませんでした');
  const bytes=await response.arrayBuffer();if(bytes.byteLength>1000000)throw Error('配送状況を確認できませんでした');
  const charset=(response.headers.get('content-type')??'').toLowerCase().includes('utf-8')?'utf-8':'shift_jis';
  return parseSeinoResult(new TextDecoder(charset).decode(bytes),number,date);
 }
 throw Error('配送状況を確認できませんでした');
}
