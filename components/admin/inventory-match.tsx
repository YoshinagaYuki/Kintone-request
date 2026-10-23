import { createClient } from "@/lib/supabase/server";
import { inventoryEnabled } from "@/lib/inventory/access";
import { addDays, ganttEntry, type InventoryRequest } from "@/lib/inventory/gantt";
import { rankCandidates, type HoldCandidate } from "@/lib/inventory/matching";
import { InventoryMatchPicker } from "./inventory-match-picker";
export async function InventoryMatch({ request }: { request: InventoryRequest }) {
  if (!inventoryEnabled()) return null;
  const entry=ganttEntry(request); if(!entry) return <p className="my-4 text-amber-800">利用日を設定すると仮押さえ候補を表示できます。</p>;
  const db=await createClient();
  const [links,holds]=await Promise.all([
    db.from("inventory_hold_links").select("hold_id").eq("request_id",request.id).limit(6),
    db.from("inventory_holds").select("id,item_id,store_name,start_date,end_date,quantity,item_name_master(name),staff_members(name),inventory_hold_links(request_id)").is("cancelled_at",null).gte("start_date",addDays(entry.start,-7)).lte("start_date",addDays(entry.start,7)).gte("end_date",addDays(entry.end,-7)).lte("end_date",addDays(entry.end,7)).limit(500),
  ]);
  if(links.error||holds.error||(holds.data?.length??0)>=500) return <p role="alert" className="my-4 text-red-700">仮押さえ候補を取得できませんでした。設定・対象件数を確認してください。</p>;
  const selected=(links.data??[]).map(l=>l.hold_id as string);
  type Row={id:string;item_id:string;store_name:string;start_date:string;end_date:string;quantity:number;item_name_master:{name:string}|null;staff_members:{name:string}|null;inventory_hold_links:{request_id:string}[]|{request_id:string}|null};
  const available=((holds.data??[]) as unknown as Row[]).filter(h=>(Array.isArray(h.inventory_hold_links)?h.inventory_hold_links:h.inventory_hold_links?[h.inventory_hold_links]:[]).every(l=>l.request_id===request.id));
  const candidates:HoldCandidate[]=available.map(h=>({...h,item_name:h.item_name_master?.name??"商品不明",staff_name:h.staff_members?.name??"担当者不明"}));
  // 日付編集で候補範囲外に出た既存選択も取得し、見えないまま誤解除しない。
  const missing=selected.filter(id=>!candidates.some(c=>c.id===id));
  if(missing.length){const result=await db.from("inventory_holds").select("id,item_id,store_name,start_date,end_date,quantity,item_name_master(name),staff_members(name)").in("id",missing);if(result.error)return <p role="alert">紐付け済みの仮押さえを取得できませんでした。</p>;for(const h of (result.data??[]) as unknown as Row[])candidates.push({...h,item_name:h.item_name_master?.name??"商品不明",staff_name:h.staff_members?.name??"担当者不明"});}
  const ranked=rankCandidates(candidates,{...entry,items:entry.items});
  const ordered=[...ranked,...candidates.filter(c=>selected.includes(c.id)&&!ranked.some(r=>r.id===c.id))];
  return <InventoryMatchPicker key={`${request.id}-${selected.join(",")}`} requestId={request.id} candidates={ordered} selected={selected}/>;
}
