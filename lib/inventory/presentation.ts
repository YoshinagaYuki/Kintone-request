import {bookingOn,bookingPhase,stockOn,type BoardBooking,type BoardLane} from './board';
import type {CapacityItem} from './availability';
export const BOARD_COLORS={empty:'#ffffff',registered:'#d1fae5',hold:'#fef3c7',pending:'#dbeafe',extension:'#ede9fe',transit:'#ecfdf5',reserve:'#e2e8f0',overflow:'#ffe4e6'};
export function boardColor(b:BoardBooking|undefined,date:string){return !b?BOARD_COLORS.empty:bookingPhase(b,date)!=='usage'?BOARD_COLORS.transit:b.status==='blocked'?BOARD_COLORS.reserve:b.status==='registered'?b.extension?BOARD_COLORS.extension:BOARD_COLORS.registered:b.status==='pending'?BOARD_COLORS.pending:BOARD_COLORS.hold;}
export function laneLocked(item:CapacityItem,lane:BoardLane,index:number,normalCount:number,date:string){const s=stockOn(item,date);return lane.kind==='reserve'?index-normalCount>=(s?.reserve??0):lane.kind==='normal'?index>=(s?.usable??0):false;}
export function boardSegments(lane:BoardLane,dates:string[],locked:(d:string)=>boolean,options:{splitPhases?:boolean;breakAt?:string}={}){
 const result:{date:string;booking?:BoardBooking;span:number;inactive:boolean}[]=[];
 for(const date of dates){const booking=bookingOn(lane,date),inactive=locked(date),previous=result[result.length-1];if(previous&&date!==options.breakAt&&previous.booking?.id===booking?.id&&previous.inactive===inactive&&(options.splitPhases===false||!booking||bookingPhase(previous.booking!,previous.date)===bookingPhase(booking,date)))previous.span++;else result.push({date,booking,span:1,inactive});}
 return result;
}
export function bookingLabel(b:BoardBooking,date:string){const phase=bookingPhase(b,date);return phase==='delivery'?'配':phase==='return'?'返':b.status==='blocked'?b.store:`${b.managementNo?b.managementNo+'：':b.kind!=='request'?'(仮) ':'番号未発行：'}${b.store}`;}
