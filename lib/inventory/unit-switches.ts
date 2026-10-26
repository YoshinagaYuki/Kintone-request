import type{BoardBooking}from'./board';import{addDays,validDate}from'./gantt';import{occupiedCycle}from'./occupied-cycle';
export type UnitSwitch={date:string;number:number};
export function unitSegments(b:BoardBooking):BoardBooking[]{
 if(!b.unitSwitches?.length||b.unitSegment)return[b];
 const cycle=occupiedCycle(b);const result:BoardBooking[]=[];let from=cycle.from,number=b.unitNumber;
 for(const change of b.unitSwitches){if(!validDate(change.date)||change.date<=b.start||change.date>b.end||change.date<=from)throw Error('機器の切替日は利用開始日の翌日から利用終了日までで指定してください');result.push({...b,unitNumber:number,from,to:addDays(change.date,-1),unitSegment:true});from=change.date;number=change.number;}
 result.push({...b,unitNumber:number,from,to:cycle.to,unitSegment:true});return result;
}
