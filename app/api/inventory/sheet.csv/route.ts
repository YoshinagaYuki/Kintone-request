import {buildSheetMirror} from "@/lib/inventory/sheet-mirror";
import type {BoardBooking} from "@/lib/inventory/board";
import { importedBookings,type ImportedEntry } from "@/lib/inventory/sheet-import";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ganttEntry, type InventoryRequest } from "@/lib/inventory/gantt";
import { extensionView } from "@/lib/inventory/extension-view";
import { matchCapacityItem } from "@/lib/inventory/availability";
import { listCsv,multiMonthGanttCsv,type SheetEntry } from "@/lib/inventory/sheet-export";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(req:NextRequest){
 const secret=process.env.INVENTORY_SHEETS_TOKEN??"",key=req.nextUrl.searchParams.get("key")??"";
 if(secret.length<32)return new NextResponse("同期未設定",{status:503});
 if(Buffer.byteLength(secret)!==Buffer.byteLength(key)||!timingSafeEqual(Buffer.from(secret),Buffer.from(key)))return new NextResponse("認証が必要です",{status:401});
 try{
  const db=createAdminClient();const rows:InventoryRequest[]=[];
  for(let offset=0;offset<=5000;offset+=500){const r=await db.from("requests").select("id,inventory_parent_request_id,status,management_no,parsed_data,approved_staff_name,company_staff_name_input,form_types!inner(kintone_app_id)").eq("form_types.kintone_app_id",10).is("deleted_at",null).neq("status","rejected").order("id").range(offset,Math.min(offset+499,5000));if(r.error)throw new Error("requests");rows.push(...(r.data??[]) as InventoryRequest[]);if((r.data?.length??0)<500)break;}
  if(rows.length>5000)throw new Error("too many requests");
  const [extensions,items,holds,imported,stocks,plans]=await Promise.all([
   db.from("inventory_extensions").select("parent_request_id,child_request_id,state").limit(1000),
   db.from("item_name_master").select("id,name,aliases").eq("category","allmight").eq("is_active",true).limit(1000),
   db.from("inventory_holds").select("id,store_name,quantity,start_date,end_date,item_name_master(name),staff_members(name),inventory_hold_links(request_id,requests(status,deleted_at))").is("cancelled_at",null).limit(1000),
   db.from("inventory_sheet_entries").select("source_key,source_tab,source_cell,staff_name,store_name,management_no,start_date,end_date,request_id,item_id,state").limit(1000),
   db.from("inventory_stock").select("item_id,total_count,reserve_count").limit(1000),
   db.from("inventory_stock_schedule").select("item_id,effective_date,total_count,reserve_count").limit(1000),
  ]);
  if([extensions,items,holds,imported,stocks,plans].some(r=>r.error||(r.data?.length??0)>=1000))throw new Error("incomplete export");
  const boardBookings:{itemId:string;booking:BoardBooking}[]=[];
  const entries:SheetEntry[]=[];const status:Record<string,string>={pending:"申請待ち",approved:"承認済み",registered:"登録完了",register_failed:"連携失敗"};
  const base=(process.env.APP_BASE_URL||req.nextUrl.origin).replace(/\/$/,"");
  for(const row of extensionView(rows,extensions.data??[])){
   const e=ganttEntry(row);if(!e||!e.items.length)throw new Error("invalid source dates or equipment");
   for(const [slot,name] of e.items.entries()){const item=matchCapacityItem(name,items.data??[]);if(item)boardBookings.push({itemId:item.id,booking:{id:e.id,group:`${e.inventory_root_id??e.id}:${slot}`,kind:"request",staff:e.staff,store:e.store,managementNo:e.management_no??"",status:e.status,from:e.from,to:e.to,start:e.start,end:e.end,delivery:e.delivery,pickup:e.pickup,href:`${base}/admin/requests/${e.id}`,extension:!!e.inventory_parent_request_id}});const product=matchCapacityItem(name,items.data??[])?.name??name;entries.push({product,staff:e.staff,store:e.store,managementNo:e.management_no??"",start:e.start,end:e.end,delivery:e.delivery,pickup:e.pickup,status:e.inventory_parent_request_id?"延長":status[e.status]??e.status,quantity:1,requestUrl:`${base}/admin/requests/${e.id}`});}
  }
  type Link={requests:{status:string;deleted_at:string|null}|null};
  type Hold={id:string;store_name:string;quantity:number;start_date:string;end_date:string;item_name_master:{name:string}|null;staff_members:{name:string}|null;inventory_hold_links:Link|Link[]|null};
  for(const h of (holds.data??[]) as unknown as Hold[]){const links=Array.isArray(h.inventory_hold_links)?h.inventory_hold_links:h.inventory_hold_links?[h.inventory_hold_links]:[];if(links.some(l=>l.requests&&!l.requests.deleted_at&&l.requests.status!=="rejected"))continue;const item=matchCapacityItem(h.item_name_master?.name??"",items.data??[]);if(item){if(h.quantity>1000)throw Error("too many units");for(let i=0;i<h.quantity;i++)boardBookings.push({itemId:item.id,booking:{id:h.id,group:`hold:${h.id}:${i}`,kind:"hold",staff:h.staff_members?.name??"担当者未設定",store:h.store_name,managementNo:"",status:"hold",from:h.start_date,to:h.end_date,start:h.start_date,end:h.end_date,delivery:"",pickup:"",href:""}});}entries.push({product:h.item_name_master?.name??"商品不明",staff:h.staff_members?.name??"担当者不明",store:h.store_name,managementNo:"",start:h.start_date,end:h.end_date,delivery:"",pickup:"",status:"仮押さえ",quantity:h.quantity,requestUrl:`${base}/admin/inventory/allmight`});}
  for(const b of importedBookings((imported.data??[]) as ImportedEntry[])){const source=(imported.data??[]).find(e=>e.source_key===b.id)!;boardBookings.push({itemId:source.item_id,booking:b});entries.push({product:(items.data??[]).find(i=>i.id===source.item_id)?.name??"商品不明",staff:b.staff,store:b.store,managementNo:"",start:b.start,end:b.end,delivery:"",pickup:"",status:b.status==="blocked"?"返却・利用不可":"仮押さえ",quantity:1,requestUrl:b.href});}
  entries.sort((a,b)=>a.start.localeCompare(b.start)||a.product.localeCompare(b.product)||a.store.localeCompare(b.store));
  const product=req.nextUrl.searchParams.get("product");
  const month=req.nextUrl.searchParams.get("month")||new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date()).slice(0,7);
  const months=Number(req.nextUrl.searchParams.get("months")||"1");
  if(!Number.isInteger(months)||months<1||months>6)return new NextResponse("期間は1〜6ヶ月で指定してください",{status:400});
  if(req.nextUrl.searchParams.get("layout")==="mirror"){
   const item=(items.data??[]).find(i=>i.name===product);if(!item)return NextResponse.json({error:"商品が見つかりません"},{status:400});
   const start=req.nextUrl.searchParams.get("start")||new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date());
   const mirror=buildSheetMirror({...item,...(stocks.data??[]).find(s=>s.item_id===item.id),schedule:(plans.data??[]).filter(p=>p.item_id===item.id)},boardBookings.filter(b=>b.itemId===item.id).map(b=>b.booking),start,months);
   return NextResponse.json(mirror,{headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }
  const csv=product?multiMonthGanttCsv(entries,product,month,months):listCsv(entries);
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"同期用の在庫データを完全に取得できませんでした"},{status:503});}
}
