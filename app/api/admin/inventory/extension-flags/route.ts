import {NextResponse} from 'next/server';
import {revalidatePath} from 'next/cache';
import {inventoryAccess} from '@/lib/inventory/access';
import {loadInventoryModel} from '@/lib/inventory/model';
import {extensionNumber} from '@/lib/inventory/extension-flags';
import {createAdminClient} from '@/lib/supabase/admin';
export async function PUT(req:Request){
 const access=await inventoryAccess();if('error'in access)return NextResponse.json({error:access.error},{status:access.status});
 try{
  const body=await req.json();if(typeof body.key!=='string'||body.key.length>200||typeof body.possible!=='boolean'||typeof body.previous!=='boolean')return NextResponse.json({error:'延長の可能性の設定を確認してください'},{status:400});
  const model=await loadInventoryModel(access.db,'','all'),record=model.records.find(r=>r.booking.key===body.key);
  if(!record||record.booking.status==='blocked')return NextResponse.json({error:'対象の案件が見つかりません'},{status:404});
  const number=extensionNumber(record.booking);if(!number)return NextResponse.json({error:'管理番号を発行済みの案件で設定できます'},{status:400});
  const business=model.items.find(i=>i.id===record.itemId)?.inventory_role==='rental_kit'?'tezukuru':'allmight';
  const result=await createAdminClient().rpc('set_inventory_extension_flag',{p_actor:access.admin.auth_user_id,p_business:business,p_number:number,p_possible:body.possible,p_previous:body.previous});
  if(result.error)return NextResponse.json({error:result.error.message.includes('flag_changed')?'別の担当者が変更しました。画面を開き直して確認してください':'延長の可能性を保存できませんでした。管理権限を確認してください'},{status:409});
  revalidatePath('/admin/inventory/allmight');revalidatePath('/admin/inventory/tezukuru');return NextResponse.json({ok:true,possible:body.possible});
 }catch{return NextResponse.json({error:'延長の可能性を保存できませんでした。再度お試しください'},{status:400});}
}
