import {NextResponse} from "next/server";
import {inventoryAccess} from "@/lib/inventory/access";
import {stockInput} from "@/lib/inventory/validation";
import {validDate} from "@/lib/inventory/gantt";
export async function PUT(req:Request){
 const access=await inventoryAccess();if("error" in access)return NextResponse.json({error:access.error},{status:access.status});
 let input;try{const body=await req.json();const counts=stockInput(body);if(!validDate(body.effective_date)||body.effective_date<"2000-01-01"||body.effective_date>"2100-12-31")throw new Error("変更予定日を正しく指定してください");input={...counts,effective_date:body.effective_date};}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"入力が不正です"},{status:400});}
 const {error}=await access.db.from("inventory_stock_schedule").upsert(input,{onConflict:"item_id,effective_date"});if(error)return NextResponse.json({error:"在庫の変更予定を保存できませんでした"},{status:500});return NextResponse.json({ok:true});
}
