import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageInventoryRequest } from "@/lib/inventory/request-access";
import {NextResponse} from "next/server";
import {inventoryAccess} from "@/lib/inventory/access";
import {runInventoryExtension} from "@/lib/inventory/extensions/runner";
export const maxDuration=60;
async function POSTHandler(_req:Request,{params}:{params:Promise<{id:string}>}){
 const access=await inventoryAccess();if("error" in access)return NextResponse.json({error:access.error},{status:access.status});
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"申請番号が不正です"},{status:400});
 if(!await canManageInventoryRequest(createAdminClient(),id,access.admin.auth_user_id))return NextResponse.json({error:"この事業の担当権限が必要です"},{status:403});
 const result=await runInventoryExtension(id,access.admin.auth_user_id);return NextResponse.json(result,{status:result.ok?200:502});
}

export const POST=withInventorySheetPush(POSTHandler);
