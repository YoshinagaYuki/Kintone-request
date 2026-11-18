import type{CapacityItem}from'./availability';import type{InventoryRecord}from'./model';import{layoutBoard,type BoardBooking,type BoardLane}from'./board';
const BASE='スティックキャッチ（大）',WRAPPED=BASE+'ラッピングバージョン';
/** A shared screen only: physical stock, allocation and editing retain their own item IDs. */
export function inventoryDisplayGroup(items:CapacityItem[],active?:string){
 const base=items.find(i=>i.name===BASE),wrapped=items.find(i=>i.name===WRAPPED);
 const requested=items.find(i=>i.id===active)??items.find(i=>i.is_active!==false)??items[0];
 const selected=base&&wrapped&&(requested?.id===base.id||requested?.id===wrapped.id)?base:requested;
 return{selected,members:selected?.id===base?.id&&wrapped?[wrapped,base!]:selected?[selected]:[],tabs:base&&wrapped?items.filter(i=>i.id!==wrapped.id):items};
}
export function groupedInventoryLanes(members:CapacityItem[],dates:string[],records:InventoryRecord[]):BoardLane[]{return members.flatMap(item=>layoutBoard(item,dates,records.filter(r=>r.itemId===item.id).map(r=>r.booking)).map(lane=>({...lane,key:`${item.id}:${lane.key}`,item,label:item.name===WRAPPED?'ラッピング':undefined})));}
export function boardSelectionItem(primary:string,records:InventoryRecord[],booking?:BoardBooking,laneItem?:string){return booking?records.find(r=>r.booking.key===booking.key)?.itemId??laneItem??primary:laneItem??primary;}
