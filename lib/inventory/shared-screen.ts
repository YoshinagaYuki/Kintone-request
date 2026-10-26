import{occupiedCycle}from'./occupied-cycle';
import{stockOn}from'./board';import type{InventoryModel,InventoryRecord}from'./model';
export const supportsScreen=(name:string)=>/^スティックキャッチ[（(][大小][）)]$/.test(name.normalize('NFKC').replace(/\s/g,''));
export function screenQuantity(value:unknown){if(value===undefined)return 0;if(!Number.isInteger(value)||(value as number)<0||(value as number)>1)throw Error('背景スクリーンは機器1台につき0〜1枚で指定してください');return value as number;}
export function screenUsage(records:InventoryRecord[],date:string){const groups=new Map<string,number>();for(const r of records)if(!r.deleted&&occupiedCycle(r.booking).from<=date&&date<=occupiedCycle(r.booking).to)groups.set(r.booking.group,Math.max(groups.get(r.booking.group)??0,r.booking.screenQuantity??0));return[...groups.values()].reduce((a,b)=>a+b,0);}
export function assertScreenCapacity(model:InventoryModel,candidates:InventoryRecord[],existing:InventoryRecord[]){
 const wanted=candidates.filter(r=>(r.booking.screenQuantity??0)>0);if(!wanted.length)return;
 for(const r of wanted)if(!supportsScreen(model.items.find(i=>i.id===r.itemId)?.name??''))throw Error('背景スクリーンはスティックキャッチ（大・小）専用です');
 const screen=model.accessories?.find(i=>i.inventory_role==='background_screen');if(!screen)throw Error('商品マスタで背景スクリーンの在庫を設定してください');
 const all=[...existing,...candidates],dates=new Set([...all.map(r=>occupiedCycle(r.booking).from),...(screen.schedule??[]).map(s=>s.effective_date)]);
 for(const date of dates)if(wanted.some(r=>occupiedCycle(r.booking).from<=date&&date<=occupiedCycle(r.booking).to)){const stock=stockOn(screen,date);if(!stock)throw Error('商品マスタで背景スクリーンの保有数・予備数を設定してください');if(screenUsage(all,date)>stock.usable)throw Error(`背景スクリーンの共通在庫を超えます（${date}：予定${screenUsage(all,date)}枚／貸出可能${stock.usable}枚）。大小合計を確認してください`);}
}
