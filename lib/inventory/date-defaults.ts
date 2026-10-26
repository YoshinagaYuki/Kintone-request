import{addDays,validDate}from'./gantt';
export type InventoryDates={deliveryRequired?:boolean;pickupRequired?:boolean;start:string;end:string;delivery:string;pickup:string;from:string;to:string};
const offset=(date:string,n:number)=>validDate(date)?addDays(date,n):'';
const min=(...dates:string[])=>dates.filter(validDate).sort()[0]??'';
const max=(...dates:string[])=>dates.filter(validDate).sort().at(-1)??'';
export function initialInventoryDates(start:string,end=start,delivery='',pickup='',from=start,to=end,deliveryRequired=true,pickupRequired=true):InventoryDates{
 const d=deliveryRequired?(delivery||offset(start,-1)):'',p=pickupRequired?(pickup||offset(end,1)):'';return{start,end,delivery:d,pickup:p,from:min(from,start,d),to:max(to,end,p),deliveryRequired,pickupRequired};
}
/** Only automatic dates follow the usage period. Custom delivery/pickup and extra inspection padding survive edits. */
export function changeInventoryDate(previous:InventoryDates,key:keyof InventoryDates,value:string):InventoryDates{
 const next={...previous,[key]:value};
 if(key==='start'&&previous.deliveryRequired!==false&&(!previous.delivery||previous.delivery===offset(previous.start,-1)))next.delivery=offset(value,-1);
 if(key==='end'&&previous.pickupRequired!==false&&(!previous.pickup||previous.pickup===offset(previous.end,1)))next.pickup=offset(value,1);
 const priorFrom=min(previous.start,previous.delivery),priorTo=max(previous.end,previous.pickup);
 if(key!=='from')next.from=previous.from===priorFrom?min(next.start,next.delivery):min(previous.from,next.start,next.delivery);
 if(key!=='to')next.to=previous.to===priorTo?max(next.end,next.pickup):max(previous.to,next.end,next.pickup);
 return next;
}

/** Explicitly absent shipping never regains a default date. Preserve only deliberate extra padding. */
export function chooseInventoryShipping(previous:InventoryDates,kind:'delivery'|'pickup',required:boolean):InventoryDates{
 const next={...previous,[`${kind}Required`]:required,[kind]:required?(previous[kind]||offset(kind==='delivery'?previous.start:previous.end,kind==='delivery'?-1:1)):''};
 const priorFrom=min(previous.start,previous.delivery),priorTo=max(previous.end,previous.pickup);
 next.from=previous.from===priorFrom?min(next.start,next.delivery):min(previous.from,next.start,next.delivery);
 next.to=previous.to===priorTo?max(next.end,next.pickup):max(previous.to,next.end,next.pickup);return next;
}
