import type {InventoryRecord} from './model';
import {shippingPlan,type TransportInput} from './shipping-policy';
export function withShippingRecord(r:InventoryRecord,name:string,closures:import('./warehouse-calendar').WarehouseClosure[]=r.booking.warehouseClosures??[]):InventoryRecord{if(r.booking.status==='blocked')return r;const base=r.booking.shippingBase??{from:r.booking.from,to:r.booking.to};const plan=shippingPlan({...r.booking,...base},name,closures);return{...r,booking:{...r.booking,warehouseClosures:closures,shippingBase:base,from:plan.from,to:plan.to}};}
export function transportFromParsed(data:Record<string,unknown>):TransportInput|undefined{
 const saved=data._inventory_transport;if(saved&&typeof saved==='object'&&!Array.isArray(saved))return saved as TransportInput;
 const address=typeof data['配送住所']==='string'?data['配送住所']:'';const returnAddress=typeof data['集荷住所']==='string'?data['集荷住所']:'';
 return address||returnAddress?{address,returnAddress}:undefined;
}

/** Editing a real address invalidates old route-specific days and acknowledgements. */
export function refreshTransportAddresses(before:Record<string,unknown>,after:Record<string,unknown>){
 const saved=transportFromParsed(before);if(!saved)return undefined;
 const address=typeof after['配送住所']==='string'?after['配送住所']:'',returnAddress=typeof after['集荷住所']==='string'?after['集荷住所']:'';
 const outboundChanged=before['配送住所']!==after['配送住所'],inboundChanged=before['集荷住所']!==after['集荷住所'];
 if(!outboundChanged&&!inboundChanged)return saved;
 return{...saved,address,returnAddress,outboundDays:outboundChanged?undefined:saved.outboundDays,returnDays:inboundChanged?undefined:saved.returnDays,confirmed:false};
}

/** Existing request-level arrangement controls are the fallback after their explicit edit. */
export function transportFromRequest(request:{parsed_data?:Record<string,unknown>|null;allmight_delivery_arrangement?:string|null;allmight_pickup_arrangement?:string|null;allmight_delivery_time?:string|null;allmight_pickup_time?:string|null;allmight_arrangement_updated_at?:string|null}){
 let saved=transportFromParsed(request.parsed_data??{});if(saved&&request.allmight_arrangement_updated_at&&Date.parse(request.allmight_arrangement_updated_at)>Date.parse(saved.arrangementUpdatedAt??'1970-01-01')){const {deliveryArrangement,pickupArrangement,deliveryTime,pickupTime,...rest}=saved;saved=rest;}const delivery=request.allmight_delivery_arrangement,pickup=request.allmight_pickup_arrangement;
 if(!saved&&!delivery&&!pickup)return undefined;
 return{address:'',...saved,...(!saved?.deliveryArrangement&&delivery?{deliveryArrangement:delivery==='charter'?'charter' as const:'normal' as const,deliveryTime:request.allmight_delivery_time??''}:{}),...(!saved?.pickupArrangement&&pickup?{pickupArrangement:pickup==='charter'?'charter' as const:'normal' as const,pickupTime:request.allmight_pickup_time??''}:{})};
}
