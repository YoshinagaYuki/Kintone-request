import {addDays,validDate} from './inventory/gantt';
export type KitProductRule={id:string;rental_product_ids?:string[]|null};
export function eventShippingDates(start:unknown,end:unknown){
 if(!validDate(start)||!validDate(end)||start>end||start<'2000-01-02'||end>'2100-12-30')throw Error('イベント実施日を正しく選択してください');
 return {delivery:addDays(start,-1),pickup:addDays(end,1),start,end};
}
/** Multiple selected kits expose the union. null keeps existing, unrestricted catalogs compatible. */
export function kitAllowsProduct(productId:string,kits:KitProductRule[],selectedIds:string[]){
 const selected=kits.filter(k=>selectedIds.includes(k.id));
 return selected.length>0&&selected.some(k=>k.rental_product_ids==null||k.rental_product_ids.includes(productId));
}
