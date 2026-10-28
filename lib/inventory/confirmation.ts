import type {InventoryModel,InventoryRecord} from './model';
import {linkedBookings,bookingEditBaseline} from './booking-bundles';
/** Only explicitly linked inventory items are promoted together. Never infer a case from store text. */
export function confirmationSource(model:InventoryModel,key:string){
 const source=model.records.find(r=>r.booking.key===key);
 if(!source||source.booking.kind==='request'||source.booking.status!=='hold'||source.booking.managementNo)throw Error('管理番号未発行の仮押さえを選択してください');
 const records=linkedBookings(model.records,source).sort((a,b)=>a.booking.key!.localeCompare(b.booking.key!));
 if(records.length<1||records.length>5)throw Error('本登録できる機器は1申請につき5台までです。案件を分けてください');
 if(records.some(r=>r.booking.kind==='request'||r.booking.status!=='hold'||r.booking.managementNo))throw Error('同じ案件に本登録済みの商品があります。申請との紐付けを確認してください');
 if(records.some(r=>r.booking.unitSwitches?.length))throw Error('機器切り替え設定がある予定は、切り替えを解除してから本登録してください');
 const b=source.booking;
 if(records.some(r=>['start','end','staff','store','delivery','pickup','from','to','deliveryRequired','pickupRequired'].some(k=>r.booking[k as keyof typeof b]!==b[k as keyof typeof b])))throw Error('同じ案件の商品で日程・担当者・店舗・配送条件を揃えてください');
 return{source,records,baseline:bookingEditBaseline(records)};
}
/** Source data is retained, and reappears if the replacement request is rejected/deleted. */
export function omitConfirmedSources(records:InventoryRecord[],requests:{parsed_data:Record<string,unknown>}[]){
 const keys=new Set(requests.flatMap(r=>Array.isArray(r.parsed_data?._inventory_confirmation_keys)?r.parsed_data._inventory_confirmation_keys.filter((v:unknown):v is string=>typeof v==='string'):[]));
 return records.filter(r=>r.booking.kind==='request'||!keys.has(r.booking.key!));
}
