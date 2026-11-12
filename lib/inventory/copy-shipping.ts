import {ALLMIGHT_FMT_LABELS as L} from '../allmight-fmt';
import {parseTransport} from './shipping-policy';
/** Keep copy shipping edits in the invoice data as well as the occupancy calculation. */
export function applyCopyShipping(data:Record<string,unknown>,value:unknown,deliveryRequired:boolean,pickupRequired:boolean){
 const transport=parseTransport(value);
 if(!transport)return data;
 return {...data,_inventory_transport:transport,...(deliveryRequired?{[L.deliveryAddress]:transport.address}:{}),...(pickupRequired?{[L.pickupAddress]:transport.returnAddress||transport.address}:{})};
}
