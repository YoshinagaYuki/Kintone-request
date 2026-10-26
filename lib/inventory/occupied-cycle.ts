import{addDays,validDate}from'./gantt';import type{BoardBooking}from'./board';
/** Imported rows without shipping dates still need the inventory default transit buffer when checking availability. */
export function occupiedCycle(b:BoardBooking){if(b.status==='blocked')return{from:b.from,to:b.to};const delivery=b.deliveryRequired===false?b.start:b.delivery||(validDate(b.start)?addDays(b.start,-1):b.from),pickup=b.pickupRequired===false?b.end:b.pickup||(validDate(b.end)?addDays(b.end,1):b.to);return{from:[b.from,delivery].sort()[0],to:[b.to,pickup].sort().at(-1)!};}
