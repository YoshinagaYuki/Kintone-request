import type { CapacityItem } from "./availability";
export type BoardBooking = { extension?:boolean; id:string; group:string; source?:string; kind:"request"|"hold"|"imported"; staff:string; store:string; managementNo:string; status:string; from:string; to:string; start:string; end:string; delivery:string; pickup:string; href:string };
export type BoardLane = { key:string; number:number; kind:"normal"|"reserve"|"overflow"|"unconfigured"; bookings:BoardBooking[] };
export function stockOn(item:CapacityItem,date:string){
 const plan=item.schedule?.filter(p=>p.effective_date<=date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];
 const total=plan?.total_count??item.total_count,reserve=plan?.reserve_count??item.reserve_count;
 if(total==null||reserve==null)return null;
 return {total,reserve,usable:total-reserve};
}
export function layoutBoard(item:CapacityItem,dates:string[],bookings:BoardBooking[]):BoardLane[]{
 if(!dates.length)return [];
 const stocks=dates.map(d=>stockOn(item,d));const configured=stocks.every(Boolean);
 const normalCount=Math.max(0,...stocks.map(s=>s?.usable??0));const reserveCount=Math.max(0,...stocks.map(s=>s?.reserve??0));
 // These are display lanes, never equipment serial numbers or persistent allocations.
 if(normalCount+reserveCount>250||bookings.length>1000)throw new Error("表示対象が多すぎます。台数または期間を確認してください。");
 const normal:BoardLane[]=Array.from({length:normalCount},(_,i)=>({key:`normal:${i}`,number:i+1,kind:"normal",bookings:[]}));
 const reserve:BoardLane[]=Array.from({length:reserveCount},(_,i)=>({key:`reserve:${i}`,number:normalCount+i+1,kind:"reserve",bookings:[]}));
 const overflow:BoardLane[]=[];const groups=new Map<string,BoardBooking[]>();
 for(const b of bookings.filter(b=>b.from<=dates[dates.length-1]&&b.to>=dates[0]))groups.set(b.group,[...(groups.get(b.group)??[]),b]);
 const ordered=[...groups.values()].sort((a,b)=>a.reduce((v,x)=>x.from<v?x.from:v,a[0].from).localeCompare(b.reduce((v,x)=>x.from<v?x.from:v,b[0].from))||a[0].group.localeCompare(b[0].group));
 const overlaps=(a:BoardBooking,b:BoardBooking)=>a.from<=b.to&&a.to>=b.from;
 for(const group of ordered){
  const activeDates=dates.filter(d=>group.some(b=>b.from<=d&&b.to>=d));
  const fits=(lane:BoardLane)=>!lane.bookings.some(a=>group.some(b=>overlaps(a,b)));
  let lane=normal.find((l,index)=>fits(l)&&activeDates.every(d=>index<(stockOn(item,d)?.usable??0)));
  if(!lane){lane=overflow.find(fits);if(!lane){if(normal.length+reserve.length+overflow.length>=250)throw new Error("表示枠が250行を超えました。表示期間を短くしてください。");lane={key:`extra:${overflow.length}`,number:overflow.length+1,kind:configured?"overflow":"unconfigured",bookings:[]};overflow.push(lane);}}
  lane.bookings.push(...group);
 }
 return [...normal,...reserve,...overflow];
}
export function bookingOn(lane:BoardLane,date:string){return lane.bookings.filter(b=>b.from<=date&&b.to>=date).sort((a,b)=>b.start.localeCompare(a.start)||a.id.localeCompare(b.id))[0];}
export function bookingPhase(b:BoardBooking,date:string){return date<b.start?"delivery":date>b.end?"return":"usage";}
