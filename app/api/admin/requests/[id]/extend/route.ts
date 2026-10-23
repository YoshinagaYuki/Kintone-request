import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { canManageInventoryRequest } from "@/lib/inventory/request-access";
import { NextResponse } from "next/server";
import { inventoryAccess } from "@/lib/inventory/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { extensionInput } from "@/lib/inventory/extensions/model";
import { extensionsEnabled, runInventoryExtension } from "@/lib/inventory/extensions/runner";
export const maxDuration=60;
async function POSTHandler(req:Request,{params}:{params:Promise<{id:string}>}) {
  const access=await inventoryAccess();
  if("error" in access)return NextResponse.json({error:access.error},{status:access.status});
  if(!extensionsEnabled())return NextResponse.json({error:"延長機能は停止中です"},{status:503});
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"申請番号が不正です"},{status:400});
  let input;try{input=extensionInput(await req.json());}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"入力が不正です"},{status:400});}
  const db=createAdminClient();
  if(!await canManageInventoryRequest(db,id,access.admin.auth_user_id))return NextResponse.json({error:"この事業の担当権限が必要です"},{status:403});
  const {data:childId,error}=await db.rpc("create_inventory_extension",{p_id:input.id,p_parent_id:id,p_usage_end:input.usage_end,p_pickup_date:input.pickup_date,p_billing_month:input.billing_month,p_actor:access.admin.auth_user_id});
  if(error||!childId)return NextResponse.json({error:"延長を作成できませんでした。登録済みか、利用日・集荷日・既存の延長を確認してください"},{status:409});
  const result=await runInventoryExtension(childId,access.admin.auth_user_id);
  return NextResponse.json({...result,childId},{status:result.ok?201:502});
}

export const POST=withInventorySheetPush(POSTHandler);
