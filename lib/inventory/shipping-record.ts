import type {InventoryRecord} from './model';
import {shippingPlan,type TransportInput} from './shipping-policy';
export function withShippingRecord(r:InventoryRecord,name:string):InventoryRecord{if(!r.booking.transport)return r;const base=r.booking.shippingBase??{from:r.booking.from,to:r.booking.to};const plan=shippingPlan({...r.booking,...base},name);return{...r,booking:{...r.booking,shippingBase:base,from:plan.from,to:plan.to}};}
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
