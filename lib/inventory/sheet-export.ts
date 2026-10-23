import { addDays, validDate } from "./gantt";
export type SheetEntry={product:string;staff:string;store:string;managementNo:string;start:string;end:string;delivery:string;pickup:string;status:string;quantity:number;requestUrl:string};
export function csvCell(value:unknown){let s=String(value??"");if(/^[=+@\-\t\r]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`;}
export function listCsv(entries:SheetEntry[]){return [
 ["商品","担当者","管理番号：店舗名","管理番号","利用開始日","利用終了日","配送日","集荷日","状態","台数","申請詳細"],
 ...entries.map(e=>[e.product,e.staff,`${e.managementNo?`${e.managementNo}：`:""}${e.store}`,e.managementNo,e.start,e.end,e.delivery,e.pickup,e.status,e.quantity,e.requestUrl]),
].map(row=>row.map(csvCell).join(",")).join("\r\n");}
export function ganttCsv(entries:SheetEntry[],product:string,month:string){
 if(!/^\d{4}-\d{2}$/.test(month)||!validDate(`${month}-01`))throw new Error("invalid month");
 const from=`${month}-01`;const d=new Date(`${from}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);const to=addDays(d.toISOString().slice(0,10),-1);const count=Number(to.slice(8));const dates=Array.from({length:count},(_,i)=>addDays(from,i));
 const rows:unknown[][]=[[`${month}月`,"台数","担当者・店舗",...dates.map(date=>date.slice(5))]];
 for(const e of entries.filter(e=>{const span=[e.start,e.end,e.delivery,e.pickup].filter(validDate).sort();return e.product===product&&span.length>0&&span[0]<=to&&span[span.length-1]>=from;}))rows.push([`${Number(month.slice(5))}月`,e.quantity,`${e.staff}\n${e.managementNo?`${e.managementNo}：`:""}${e.store}\n${e.status}`,...dates.map(date=>[date===e.delivery?"配":"",date>=e.start&&date<=e.end?e.status==="仮押さえ"?"仮":"利用":"",date===e.pickup?"集":""].filter(Boolean).join("・"))]);
 if(rows.length===1)rows.push([`${Number(month.slice(5))}月`,"","この月のシステム登録はありません",...dates.map(()=>"")]);
 return rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
}

export function multiMonthGanttCsv(entries:SheetEntry[],product:string,month:string,count:number){
 if(!Number.isInteger(count)||count<1||count>6||!validDate(`${month}-01`))throw new Error("invalid months");
 const date=new Date(`${month}-01T00:00:00Z`);const sections:string[]=[];
 for(let i=0;i<count;i++){sections.push(ganttCsv(entries,product,date.toISOString().slice(0,7)));date.setUTCMonth(date.getUTCMonth()+1);}
 return sections.join("\r\n"+Array.from({length:34},()=>csvCell("")).join(",")+"\r\n");
}
