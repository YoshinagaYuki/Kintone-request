import {loadInventoryModel} from "@/lib/inventory/model";
import {buildSheetMirror} from "@/lib/inventory/sheet-mirror";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { listCsv,multiMonthGanttCsv,type SheetEntry } from "@/lib/inventory/sheet-export";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(req:NextRequest){
 const secret=process.env.INVENTORY_SHEETS_TOKEN??"",key=req.nextUrl.searchParams.get("key")??"";
 if(secret.length<32)return new NextResponse("同期未設定",{status:503});
 if(Buffer.byteLength(secret)!==Buffer.byteLength(key)||!timingSafeEqual(Buffer.from(secret),Buffer.from(key)))return new NextResponse("認証が必要です",{status:401});
 try{
  const base=(process.env.APP_BASE_URL||req.nextUrl.origin).replace(/\/$/,"");
  const model=await loadInventoryModel(createAdminClient(),base);
  const boardBookings=model.records;
  const entries:SheetEntry[]=model.records.map(({itemId,booking:b})=>({product:model.items.find(i=>i.id===itemId)?.name??"商品不明",staff:b.staff,store:b.store,managementNo:b.managementNo,start:b.start,end:b.end,delivery:b.delivery,pickup:b.pickup,status:b.status==="blocked"?"利用不可":!b.managementNo?"仮押さえ":"登録完了",quantity:1,requestUrl:b.href}));
  entries.sort((a,b)=>a.start.localeCompare(b.start)||a.product.localeCompare(b.product)||a.store.localeCompare(b.store));
  const product=req.nextUrl.searchParams.get("product");
  const month=req.nextUrl.searchParams.get("month")||new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date()).slice(0,7);
  const months=Number(req.nextUrl.searchParams.get("months")||"1");
  if(!Number.isInteger(months)||months<1||months>6)return new NextResponse("期間は1〜6ヶ月で指定してください",{status:400});
  if(req.nextUrl.searchParams.get("layout")==="mirror"){
   const item=model.items.find(i=>i.name===product);if(!item)return NextResponse.json({error:"商品が見つかりません"},{status:400});
   const start=req.nextUrl.searchParams.get("start")||new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date());
   const mirror=buildSheetMirror(item,boardBookings.filter(b=>b.itemId===item.id).map(b=>b.booking),start,months);
   return NextResponse.json(mirror,{headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }
  const csv=product?multiMonthGanttCsv(entries,product,month,months):listCsv(entries);
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"同期用の在庫データを完全に取得できませんでした"},{status:503});}
}
