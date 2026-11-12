import {createHash} from 'node:crypto';
import type {InventoryRecord} from './model';
/** An unrelated inventory update cannot invalidate the source invoice. */
export function copySourceBaseline(source:{related:InventoryRecord[];parsed:Record<string,unknown>;snapshot:unknown;formId:string;version:number;parentKey:string;billingType:string;rentalPlanId:string}){
 return createHash('sha256').update(JSON.stringify({records:[...source.related].sort((a,b)=>(a.booking.key??'').localeCompare(b.booking.key??'')),parsed:source.parsed,snapshot:source.snapshot,formId:source.formId,formVersion:source.version,parentKey:source.parentKey,billingType:source.billingType,rentalPlanId:source.rentalPlanId})).digest('hex');
}
