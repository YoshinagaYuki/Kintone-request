import {NextRequest,NextResponse} from 'next/server';
import {revalidatePath} from 'next/cache';
import {inventoryAccess} from '@/lib/inventory/access';
import {loadInventoryModel} from '@/lib/inventory/model';
import {linkedBookings} from '@/lib/inventory/booking-bundles';
import {isHoldPhase,holdWorkflowKeys} from '@/lib/inventory/hold-workflow';
import {assertCopySourceEditable} from '@/lib/inventory/copy-guard';
import {createAdminClient} from '@/lib/supabase/admin';
import {withInventorySheetPush} from '@/lib/inventory/sheet-push';
export const POST=withInventorySheetPush(async(req:NextRequest)=>{
 const access=await inventoryAccess();if('error'in access)return NextResponse.json({error:access.error},{status:access.status});
 try{
  const raw=await req.text();if(raw.length>4000)throw Error('入力内容を確認してください');
  const body=JSON.parse(raw);if(typeof body.key!=='string'||!Number.isSafeInteger(body.version)||(!isHoldPhase(body.phase)||body.phase==='shipping_entered'&&!body.cancel)||typeof body.cancel!=='boolean')throw Error('入力内容を確認してください');
  const model=await loadInventoryModel(access.db,'','all');if(model.version!==body.version)return NextResponse.json({error:'在庫が更新されています。画面を再読み込みしてください'},{status:409});
  const selected=model.records.find(r=>r.booking.key===body.key);if(!selected)throw Error('仮押さえが見つかりません');
  const records=[selected,...linkedBookings(model.records,selected)];if(records.some(r=>r.booking.status!=='hold'||!!r.booking.managementNo))throw Error('本登録済みの予定は変更・キャンセルできません');
  const db=createAdminClient(),itemIds=[...new Set(records.map(r=>r.itemId))];
  const items=await db.from('item_name_master').select('id,category').in('id',itemIds);
  if(items.error||items.data.length!==itemIds.length||new Set(items.data.map(i=>i.category)).size!==1)throw Error('商品の事業設定を確認してください');
  const app=items.data[0].category==='allmight'?10:items.data[0].category==='tezukuru'?49:0;
  const form=await db.from('form_types').select('id').eq('kintone_app_id',app).single();
  if(form.error)throw Error('商品の事業設定を確認してください');
  const grant=await db.from('admin_user_businesses').select('admin_user_id').eq('admin_user_id',access.admin.id).eq('form_type_id',form.data.id).maybeSingle();
  if(grant.error||!grant.data)return NextResponse.json({error:'この事業の管理権限が必要です'},{status:403});
  const keys=holdWorkflowKeys(records);
  if(body.cancel)for(const key of keys)await assertCopySourceEditable(db,key);
  const result=await db.rpc('save_inventory_hold_workflow',{p_actor:access.admin.auth_user_id,p_expected:model.version,p_keys:keys,p_phase:body.phase,p_cancel:body.cancel,p_app:app});
  if(result.error)return NextResponse.json({error:result.error.message.includes('inventory_stale')?'在庫が更新されています。画面を再読み込みしてください':'保存できませんでした。本登録や連携処理の状態を確認してください'},{status:409});
  revalidatePath('/admin/inventory/allmight');revalidatePath('/admin/inventory/tezukuru');return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'保存できませんでした'},{status:400});}
});
