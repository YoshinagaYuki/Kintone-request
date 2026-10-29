import{ALLMIGHT_FMT_LABELS as L}from'../allmight-fmt';
import type{FieldMapping,KintoneRecord}from'../kintone/mapper';
export function confirmationShippingLabels(parsed:Record<string,unknown>){
 if(!Array.isArray(parsed._inventory_confirmation_keys))return[];
 return[...(parsed._inventory_delivery_required===false?[L.deliveryDate,L.deliveryPostal,L.deliveryAddress,L.deliveryReceiver,L.deliveryContact]:[]),...(parsed._inventory_pickup_required===false?[L.pickupDate,L.pickupPostal,L.pickupAddress,L.pickupHandover,L.pickupContact]:[])];
}
export function confirmationMapping(mapping:FieldMapping,parsed:Record<string,unknown>):FieldMapping{
 const omitted=confirmationShippingLabels(parsed);return{...mapping,mappings:mapping.mappings.map(m=>omitted.includes(m.fmt_label as any)?{...m,required:false}:m)};
}
export function applyConfirmationShipping(record:KintoneRecord,parsed:Record<string,unknown>,mapping:FieldMapping){
 if(!Array.isArray(parsed._inventory_confirmation_keys))return;
 const omitted=confirmationShippingLabels(parsed);for(const m of mapping.mappings)if(omitted.includes(m.fmt_label as any)&&!(Array.isArray(parsed._inventory_kit_names)&&['日付_0','日付_1'].includes(m.kintone_code)))record[m.kintone_code]={value:''};
 if(Array.isArray(parsed._inventory_kit_names)){if(parsed._inventory_usage_start)record['日付_0']={value:String(parsed._inventory_usage_start)};if(parsed._inventory_usage_end)record['日付_1']={value:String(parsed._inventory_usage_end)};}
 if(parsed._inventory_delivery_required===false){record['手配種別']={value:'手配不要'};record['納品_時間']={value:''};}
 if(parsed._inventory_pickup_required===false){record['集荷_手配種別']={value:'手配不要'};record['集荷_時刻']={value:''};}
}
