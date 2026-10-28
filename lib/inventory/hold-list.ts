import type{InventoryRecord}from'./model';
export type HoldCase={key:string;store:string;staff:string[];start:string;end:string;records:InventoryRecord[];equipment:{itemId:string;name:string;quantity:number}[]};
/** Only explicit batch/request linkage groups reservations. Similar store names never merge cases. */
export function holdCases(records:InventoryRecord[],items:{id:string;name:string}[]):HoldCase[]{
 const groups=new Map<string,HoldCase>(),seen=new Set<string>();
 for(const r of records){const b=r.booking;if(r.deleted||b.status!=='hold')continue;const identity=b.key??`${b.kind}:${b.id}:${b.group}`;if(seen.has(identity))continue;seen.add(identity);
  const key=b.bundleKey??(b.kind==='request'?`request:${b.id}`:identity);let row=groups.get(key);
  if(!row){row={key,store:b.store,staff:[],start:b.start,end:b.end,records:[],equipment:[]};groups.set(key,row);}
  row.start=[row.start,b.start].sort()[0];row.end=[row.end,b.end].sort().at(-1)!;if(b.staff&&!row.staff.includes(b.staff))row.staff.push(b.staff);row.records.push(r);
  const equipment=row.equipment.find(e=>e.itemId===r.itemId);if(equipment)equipment.quantity++;else row.equipment.push({itemId:r.itemId,name:items.find(i=>i.id===r.itemId)?.name??'商品未設定',quantity:1});
 }
 return [...groups.values()].sort((a,b)=>a.start.localeCompare(b.start)||a.store.localeCompare(b.store,'ja')||a.key.localeCompare(b.key));
}
export function filterHoldCases(rows:HoldCase[],query:string,today:string,includePast=false){const q=query.normalize('NFKC').toLowerCase().trim();return rows.filter(r=>(includePast||r.end>=today)&&(!q||[r.store,...r.staff,...r.equipment.map(e=>e.name)].some(v=>v.normalize('NFKC').toLowerCase().includes(q))));}
