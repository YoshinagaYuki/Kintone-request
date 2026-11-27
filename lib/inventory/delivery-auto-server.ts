import 'server-only';
import {createAdminClient} from '../supabase/admin';
import {loadInventoryModel} from './model';
import {deliveryRows,type DeliveryRow} from './deliveries';
import {loadWarehouseDeliveryTracking} from './delivery-tracking';
import {findRecords} from '../kintone/client';
import {checkSeino} from './carriers/seino';
import {runDeliveryAutoChecks,trackingFingerprint} from './delivery-auto';
import type {InventoryBusiness} from './business';
export const COMPLETION_FIELDS='delivery_key,completed,completed_at,completion_source,auto_disabled,auto_checked_at,auto_status,auto_fingerprint,updated_at';
export function completionView(row:Record<string,unknown>){return {key:row.delivery_key,completed:row.completed,completedAt:row.completed_at,source:row.completion_source,autoDisabled:row.auto_disabled,checkedAt:row.auto_checked_at,autoStatus:row.auto_status,updatedAt:row.updated_at};}
export async function autoCheckDeliveries(business:InventoryBusiness,from:string,to:string){
 const db=createAdminClient(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
 async function snapshot(){const model=await loadInventoryModel(db,'',business),rows=deliveryRows(model.records,model.items).filter(r=>r.date>=from&&r.date<=to);return{rows,tracking:await loadWarehouseDeliveryTracking(rows.map(r=>r.managementNo),business==='allmight'?10:49,Number(process.env.KINTONE_APP_ID_SHIPPING??'11'),findRecords)};}
 const config=await db.from('inventory_delivery_automation_config').select('enabled').eq('singleton',true).single();if(config.error)throw Error('自動確認の設定を取得できませんでした');
 if(config.data.enabled){
  const {rows,tracking}=await snapshot();
  const stored=await db.from('inventory_delivery_completions').select(COMPLETION_FIELDS).eq('business',business).gte('delivery_date',from).lte('delivery_date',to);if(stored.error)throw Error('配送記録を取得できませんでした');
  for(const saved of stored.data??[]){const row=rows.find(r=>r.key===saved.delivery_key),shipment=row?tracking[row.managementNo]:undefined;if(saved.completed&&saved.completion_source==='seino'&&!saved.auto_disabled&&row&&(!shipment||shipment.ambiguous||trackingFingerprint(shipment)!==saved.auto_fingerprint)){const invalidated=await db.rpc('invalidate_delivery_auto_identity',{p_business:business,p_key:row.key,p_fingerprint:saved.auto_fingerprint});if(invalidated.error)throw Error('伝票変更後の再確認を開始できませんでした');saved.completed=false;saved.auto_checked_at=null;}}
  await runDeliveryAutoChecks(rows,tracking,Object.fromEntries((stored.data??[]).map(r=>[r.delivery_key,r])),today,{
   claim:async(row,fingerprint)=>{const r=await db.rpc('claim_delivery_auto_check',{p_business:business,p_key:row.key,p_date:row.date,p_fingerprint:fingerprint});if(r.error)throw Error('自動確認を開始できませんでした');return r.data as string|null;},
   check:checkSeino,refresh:snapshot,
   finish:async(row:DeliveryRow,lease,fingerprint,delivered,status)=>{const r=await db.rpc('finish_delivery_auto_check',{p_business:business,p_key:row.key,p_lease:lease,p_fingerprint:fingerprint,p_delivered:delivered,p_status:status});if(r.error)throw Error('自動確認の結果を保存できませんでした');},
  });
 }
 const result=await db.from('inventory_delivery_completions').select(COMPLETION_FIELDS).eq('business',business).gte('delivery_date',from).lte('delivery_date',to);if(result.error)throw Error('配送記録を取得できませんでした');
 return (result.data??[]).map(completionView);
}
