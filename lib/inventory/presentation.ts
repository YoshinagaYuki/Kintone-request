import {bookingOn,bookingPhase,stockOn,type BoardBooking,type BoardLane} from './board';
import type {CapacityItem} from './availability';
export const BOARD_COLORS={empty:'#ffffff',registered:'#d1fae5',hold:'#fef3c7',pending:'#dbeafe',extension:'#ede9fe',transit:'#e2e8f0',travel:'#f1f5f9',buffer:'#f8fafc',reserve:'#e2e8f0',overflow:'#ffe4e6'};
export function boardColor(b:BoardBooking|undefined,date:string){return !b?BOARD_COLORS.empty:['outbound','inbound'].includes(bookingPhase(b,date))?BOARD_COLORS.travel:bookingPhase(b,date)==='buffer'?BOARD_COLORS.buffer:bookingPhase(b,date)!=='usage'?BOARD_COLORS.transit:b.status==='blocked'?BOARD_COLORS.reserve:b.status==='registered'?b.extension?BOARD_COLORS.extension:BOARD_COLORS.registered:b.status==='pending'?BOARD_COLORS.pending:BOARD_COLORS.hold;}
export function laneLocked(item:CapacityItem,lane:BoardLane,_index:number,_normalCount:number,date:string){const s=stockOn(item,date);return lane.kind==='normal'||lane.kind==='reserve'?lane.number>(s?.total??0):false;}
export function boardSegments(lane:BoardLane,dates:string[],locked:(d:string)=>boolean,options:{splitPhases?:boolean;breakAt?:string}={}){
 const result:{date:string;booking?:BoardBooking;span:number;inactive:boolean}[]=[];
 for(const date of dates){const booking=bookingOn(lane,date),inactive=locked(date),previous=result[result.length-1];if(previous&&date!==options.breakAt&&previous.booking?.id===booking?.id&&previous.inactive===inactive&&(options.splitPhases===false||!booking||bookingPhase(previous.booking!,previous.date)===bookingPhase(booking,date)))previous.span++;else result.push({date,booking,span:1,inactive});}
 return result;
}
export function bookingLabel(b:BoardBooking,date:string){const phase=bookingPhase(b,date);return phase==='outbound'?'輸送→':phase==='inbound'?'←返送':phase==='buffer'?'確保':phase==='delivery'?'配':phase==='return'?'返':b.status==='blocked'?b.store:`${b.managementNo?b.managementNo+'：':(b.kind!=='request'||b.status==='hold')?'(仮) ':'番号未発行：'}${b.store}${b.screenQuantity?' ［背景］':''}`;}

/** Restrained outlines keep status readable without turning the entire grid into solid color. */
export function boardStroke(b:BoardBooking,date:string){return bookingPhase(b,date)!=='usage'||b.status==='blocked'?'#cbd5e1':b.status==='registered'?b.extension?'#c4b5fd':'#86d9b7':b.status==='pending'?'#93b8ee':'#e9cc78';}

export function isTransportDay(b:BoardBooking,date:string){const phase=bookingPhase(b,date);return phase==='delivery'||phase==='return';}
