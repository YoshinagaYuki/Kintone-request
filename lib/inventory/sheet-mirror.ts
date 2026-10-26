import {shiftMonth} from './calendar';
import {addDays,validDate} from './gantt';
import {layoutBoard,bookingOn,type BoardBooking} from './board';
import type {CapacityItem} from './availability';
import {boardColor,boardSegments,laneLocked,bookingLabel,BOARD_COLORS} from './presentation';
export type SheetMirror={version:1;product:string;from:string;to:string;values:string[][];backgrounds:string[][];notes:string[][];merges:{row:number;column:number;span:number}[];headerRows:number[];unitEndRows:number[]};
function nextMonth(date:string){const d=new Date(`${date}T00:00:00Z`),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
export function buildSheetMirror(item:CapacityItem,bookings:BoardBooking[],start:string,count:number):SheetMirror{
 if(!validDate(start)||!Number.isInteger(count)||count<1||count>6)throw Error('invalid mirror period');
 const result:SheetMirror={version:1,product:item.name,from:start,to:start,values:[],backgrounds:[],notes:[],merges:[],headerRows:[],unitEndRows:[]};
 const append=(values:string[],colors:string[]=[],notes:string[]=[])=>{result.values.push(Array.from({length:33},(_,i)=>values[i]??''));result.backgrounds.push(Array.from({length:33},(_,i)=>colors[i]??'#ffffff'));result.notes.push(Array.from({length:33},(_,i)=>notes[i]??''));};
 let from=start;
 for(let month=0;month<count;month++){
  const until=nextMonth(from),to=addDays(until,-1),days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
  const dates=Array.from({length:days},(_,i)=>addDays(from,i));const historyFrom=shiftMonth(from,-1),historyDays=Math.round((Date.parse(from)-Date.parse(historyFrom))/86400000);const layoutDates=Array.from({length:historyDays+dates.length},(_,i)=>addDays(historyFrom,i));const lanes=layoutBoard(item,layoutDates,bookings),normalCount=lanes.filter(l=>l.kind==='normal').length;
  result.headerRows.push(result.values.length);result.merges.push({row:result.values.length,column:0,span:2});
  append([`${from.slice(0,4)}年 ${from.slice(5).replace('-','/')}〜${to.slice(5).replace('-','/')}`,'',...dates.map(d=>`${d.slice(5).replace('-','/')}\n${'日月火水木金土'[new Date(`${d}T00:00:00Z`).getUTCDay()]}`)],['#0f172a','#0f172a',...dates.map(d=>new Date(`${d}T00:00:00Z`).getUTCDay()===0?'#fff1f2':new Date(`${d}T00:00:00Z`).getUTCDay()===6?'#eff6ff':'#f1f5f9')]);
  for(const [index,lane] of lanes.entries()){
   const reserved=lane.kind==='reserve',labelColor=reserved?BOARD_COLORS.reserve:lane.kind==='overflow'?BOARD_COLORS.overflow:'#f8fafc';
   const top=[''+(lane.kind==='unassigned'?'未割当'+lane.number:lane.kind==='overflow'?'競合'+lane.number:lane.number),reserved?'予備':'担当者'];const bottom=['',reserved?'使用可能':'イベント場所'];
   const backgrounds=[labelColor,labelColor],notes=['',''];
   for(const date of dates){const b=bookingOn(lane,date);const inactive=laneLocked(item,lane,index,normalCount,date);top.push(b?.staff??'');bottom.push('');backgrounds.push((reserved&&!b)||inactive?BOARD_COLORS.reserve:lane.kind==='overflow'?BOARD_COLORS.overflow:boardColor(b,date));notes.push(b?`${b.managementNo?b.managementNo+'：':''}${b.store}\n番号：${b.unitNumber??'未割当'}\n背景スクリーン：${b.screenQuantity??0}枚\n担当者：${b.staff}\n利用：${b.start}〜${b.end}${b.delivery?'\n配送：'+b.delivery:''}${b.pickup?'\n集荷：'+b.pickup:''}${b.href?'\n'+b.href:''}`:'');}
   for(const segment of boardSegments(lane,dates,d=>laneLocked(item,lane,index,normalCount,d),{splitPhases:false})){if(!segment.booking)continue;const col=2+dates.indexOf(segment.date);for(let i=1;i<segment.span;i++)top[col+i]='';if(segment.span>1)result.merges.push({row:result.values.length,column:col,span:segment.span});}
   for(const segment of boardSegments(lane,dates,d=>laneLocked(item,lane,index,normalCount,d))){if(!segment.booking)continue;const col=2+dates.indexOf(segment.date);const spanDates=dates.slice(col-2,col-2+segment.span);bottom[col]=bookingLabel(segment.booking,segment.date)+(spanDates.includes(segment.booking.delivery)&&bookingLabel(segment.booking,segment.date)!=='配'?' ［配］':'')+(spanDates.includes(segment.booking.pickup)&&bookingLabel(segment.booking,segment.date)!=='返'?' ［集］':'');if(segment.span>1)result.merges.push({row:result.values.length+1,column:col,span:segment.span});}
   append(top,backgrounds.map((color,i)=>{if(i<2||lane.kind==='overflow'||laneLocked(item,lane,index,normalCount,dates[i-2]))return color;const b=bookingOn(lane,dates[i-2]);return boardColor(b,b?.start??dates[i-2]);}),notes);append(bottom,backgrounds,notes);result.unitEndRows.push(result.values.length-1);
  }
  append([]);from=until;result.to=to;
 }
 return result;
}
