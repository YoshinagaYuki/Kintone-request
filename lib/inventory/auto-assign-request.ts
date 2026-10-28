import type {SupabaseClient} from '@supabase/supabase-js';
import {loadInventoryModel} from './model';
import {slotSchedule,automaticSchedule} from './operations';
import {planRequestAllocation} from './auto-allocation';
/** Each guarded write uses the same DB lock/version as manual edits. A stale partial attempt is re-planned, never overwritten. */
export async function autoAssignRequest(db:SupabaseClient,requestId:string,actor:string){
 for(let attempt=0;attempt<4;attempt++){
  const model=await loadInventoryModel(db);const plan=planRequestAllocation(model,requestId);
  if(!plan.assigned.length)return {unassigned:plan.unavailable.length};
  let version=model.version,stale=false;
  const groups=new Set(plan.assigned.map(r=>r.booking.group));
  const existing=automaticSchedule(model.records.filter(r=>!groups.has(r.booking.group)));
  const affected=model.records.filter(r=>plan.assigned.some(a=>a.itemId===r.itemId&&a.booking.group===r.booking.group)).map(r=>({...r,booking:{...r.booking,unitNumber:plan.assigned.find(a=>a.itemId===r.itemId&&a.booking.group===r.booking.group)!.booking.unitNumber}}));
  for(const record of plan.assigned){
   const r=await db.rpc('save_inventory_operation',{p_actor:actor,p_expected:version,p_action:'assign',p_key:record.booking.key,p_group:record.booking.group,p_item_id:record.itemId,p_unit_number:record.booking.unitNumber,p_patch:{},p_candidate:slotSchedule(affected),p_existing:existing});
   if(r.error){if(r.error.message.includes('inventory_stale')){stale=true;break;}throw Error('機器番号を保存できませんでした。手動で番号を確認してください');}
   version++;
  }
  if(stale)continue;
  await db.from('request_histories').insert({request_id:requestId,action:'inventory_auto_assigned',actor,detail:{assignments:plan.assigned.map(r=>({item_id:r.itemId,group:r.booking.group,unit_number:r.booking.unitNumber})),unassigned:plan.unavailable.length,turnaround_days:4}});
  return {unassigned:plan.unavailable.length};
 }
 throw Error('在庫が同時更新されました。機器番号を確認してください');
}
