import'server-only';
import{createAdminClient}from'../supabase/admin';
import{canManageInventoryRequest}from'./request-access';
import type{SupabaseClient}from'@supabase/supabase-js';
import{getRecord,findRecords,updateRecord}from'../kintone/client';
/** Child registration is the ordinary App49 pipeline. Only the physical pickup is handed off. */
export async function finishTezukuruCopy(_db:SupabaseClient,id:string,actor:string){
 const db=createAdminClient();if(!await canManageInventoryRequest(db,id,actor,[49]))throw Error('この事業の担当権限が必要です');
 const job=await db.from('inventory_copy_requests').select('state,source_snapshot').eq('id',id).single();if(job.error)throw Error('延長の引継ぎ状態を確認できません');if(job.data.state==='complete')return;
 const request=await db.from('requests').select('parsed_data,management_no').eq('id',id).single();if(request.error||!request.data.management_no)throw Error('新しい管理番号の発行を確認できません');
 const source=job.data.source_snapshot,parsed=request.data.parsed_data??{};
 if(parsed._inventory_delivery_required===false&&source.record_id&&source.pickup_date){
  const parent=await getRecord(49,String(source.record_id));if(String(parent.record['管理番号']?.value)!==source.management_no)throw Error('コピー元の管理番号が一致しません');
  const pickup=String(parent.record['集荷_日付']?.value??'');if(pickup&&pickup!==source.pickup_date)throw Error('元案件の集荷日が変更されています。元の案件を確認してください');
  const ships=await findRecords(11,`管理番号 = "${String(source.management_no).replace(/[^0-9]/g,'')}"`,['$id']);if(ships.length!==1)throw Error('元案件の配送管理を1件に特定できません');
  const shipId=String(ships[0].$id.value),shipping=await getRecord(11,shipId),shipPickup=String(shipping.record['集荷_日付']?.value??'');if(shipPickup&&shipPickup!==source.pickup_date)throw Error('配送管理の集荷日が変更されています');
  const fields={'集荷_日付':{value:''},'集荷_手配種別':{value:'手配不要'}};
  if(pickup||String(parent.record['集荷_手配種別']?.value)!=='手配不要')await updateRecord(49,String(source.record_id),fields,String(parent.record.$revision?.value??''));
  if(shipPickup||String(shipping.record['集荷_手配種別']?.value)!=='手配不要')await updateRecord(11,shipId,fields,String(shipping.record.$revision?.value??''));
 }
 const saved=await db.from('inventory_copy_requests').update({state:'complete',last_error:null,updated_at:new Date().toISOString()}).eq('id',id);if(saved.error)throw Error('延長の完了状態を保存できません');
 await db.from('request_histories').insert({request_id:id,action:'inventory_copy_completed',actor,detail:{source_management_no:source.management_no,management_no:request.data.management_no,source:'tezukuru_inventory',pickup_handoff:parsed._inventory_delivery_required===false}});
}
