import{isValidTime}from'../allmight-arrangement';
import type{KintoneRecord}from'../kintone/mapper';
export type InventoryArrangement={arrangementUpdatedAt?:string;deliveryArrangement?:'normal'|'charter';pickupArrangement?:'normal'|'charter';deliveryTime?:string;pickupTime?:string};
export function parseInventoryArrangement(v:Record<string,unknown>):InventoryArrangement{
 const result:InventoryArrangement={};for(const kind of ['delivery','pickup']as const){const mode=v[`${kind}Arrangement`],time=v[`${kind}Time`];if(mode===undefined&&time===undefined)continue;if(mode!=='normal'&&mode!=='charter')throw Error('配送・集荷の手配種別を確認してください');if(time!=null&&time!==''&&(typeof time!=='string'||!isValidTime(time)))throw Error('チャーターの時刻はHH:MMで入力してください');if(mode==='charter'&&!time)throw Error(`${kind==='delivery'?'配送':'集荷'}のチャーター時刻を入力してください`);result[`${kind}Arrangement`]=mode;result[`${kind}Time`]=mode==='charter'?String(time).trim():'';}if(result.deliveryArrangement||result.pickupArrangement)result.arrangementUpdatedAt=new Date().toISOString();return result;
}
/** Only explicit inventory settings override existing arrangement choices. */
export function applyInventoryArrangements(record:KintoneRecord,data:Record<string,unknown>){
 const transport=data._inventory_transport as InventoryArrangement|undefined;if(!transport)return;
 for(const kind of ['delivery','pickup']as const){const mode=transport[`${kind}Arrangement`];if(mode!=='normal'&&mode!=='charter')continue;const required=data[kind==='delivery'?'_inventory_delivery_required':'_inventory_pickup_required']!==false;const time=transport[`${kind}Time`]??'';if(required&&mode==='charter'&&!isValidTime(time))throw Error('チャーターの時刻を確認してください');record[kind==='delivery'?'手配種別':'集荷_手配種別']={value:!required?'手配不要':mode==='charter'?'チャーター便':'通常配送'};record[kind==='delivery'?'納品_時間':'集荷_時刻']={value:required&&mode==='charter'?time:''};}
}
