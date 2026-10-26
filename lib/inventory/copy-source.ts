import'server-only';
import type{SupabaseClient}from'@supabase/supabase-js';
import type{InventoryModel}from'./model';
import{getRecord,findRecords}from'../kintone/client';
import type{FieldMapping}from'../kintone/mapper';
import{getVersionedConfig}from'../form-types';
import{equipmentLabel}from'../allmight-fmt';
import{matchCapacityItem}from'./availability';
export async function prepareCopySource(db:SupabaseClient,model:InventoryModel,key:string){
 const source=model.records.find(r=>r.booking.key===key);if(!source||source.booking.status==='blocked')throw Error('コピーする貸出予定を選択してください');
 const b=source.booking;if(b.status!=='registered'||!b.managementNo)throw Error('元の管理番号を確定してからコピーしてください');if(b.kind==='request'){const outgoing=await db.from('inventory_extensions').select('child_request_id').eq('parent_request_id',b.id).maybeSingle();if(outgoing.data)throw Error('この申請には延長先があります。最新の延長先からコピーしてください');}
 const form=await db.from('form_types').select('id,version,field_mapping').eq('kintone_app_id',10).single();if(form.error)throw Error('オールマイトの申請設定を確認してください');
 let parsed:Record<string,unknown>={},formId=form.data.id,version=form.data.version,recordId:string|null=null;
 if(b.kind==='request'){const r=await db.from('requests').select('parsed_data,form_type_id,form_type_version,kintone_record_id,processing_at,status').eq('id',b.id).single();if(r.error||r.data.processing_at)throw Error('元申請の処理が完了してからコピーしてください');parsed={...r.data.parsed_data};formId=r.data.form_type_id;version=r.data.form_type_version;recordId=r.data.kintone_record_id;}
 let related=b.kind==='request'?model.records.filter(r=>r.booking.kind==='request'&&r.booking.id===b.id):b.managementNo?model.records.filter(r=>r.booking.managementNo===b.managementNo&&r.booking.end===b.end&&r.booking.status!=='blocked'): [source];
 // One case is copied as one invoice, including repeated equipment slots.
 related=related.filter((r,i,all)=>b.kind==='request'||r.booking.unitNumber==null||all.findIndex(t=>t.itemId===r.itemId&&t.booking.unitNumber===r.booking.unitNumber)===i).sort((a,z)=>a.booking.key!.localeCompare(z.booking.key!));
 const config=await getVersionedConfig(db,formId,version);const mapping=(config?.field_mapping??form.data.field_mapping)as FieldMapping;
 if(!mapping?.mappings?.length)throw Error('申請のkintone項目設定がありません');
 let remote:Awaited<ReturnType<typeof getRecord>>|null=null;
 if(b.managementNo){if(!/^\d+$/.test(b.managementNo))throw Error('コピー元の管理番号を確認してください');if(!recordId){const rs=await findRecords(10,`管理番号 = "${b.managementNo}" limit 2`,['$id']);if(rs.length!==1)throw Error('コピー元のkintone管理番号を1件に特定できません');recordId=String(rs[0].$id.value);}remote=await getRecord(10,recordId);
 if(String(remote.record['管理番号']?.value)!==b.managementNo||String(remote.record['日付_1']?.value)!==b.end)throw Error('元の利用終了日・管理番号がkintoneと一致しません。元案件を確認してください');
 if(b.kind!=='request')for(const m of mapping.mappings){const value=remote.record[m.kintone_code]?.value;if(typeof value==='string')parsed[m.fmt_label]=value;}
 const names=Array.from({length:5},(_,i)=>mapping.mappings.find(m=>m.fmt_label===equipmentLabel(i+1))).map(m=>m?String(remote!.record[m.kintone_code]?.value??''):'').filter(Boolean);
 const expected=names.map(n=>matchCapacityItem(n,model.items)?.id);const actual=related.map(r=>r.itemId);if(expected.some(id=>!id)||expected.length!==actual.length||[...expected].sort().join()!==[...actual].sort().join())throw Error('同じ管理番号の機器をすべて確認できません。機器の紐付け・番号を確認してください');
 }
 if(related.length<1||related.length>5||related.some(r=>r.booking.end!==b.end))throw Error('同じ申請の全機器は共通の利用終了日・最大5台でコピーしてください');
 return{source,related,parsed,formId,version,parentKey:b.managementNo?`number:${b.managementNo}`:b.kind==='request'?`request:${b.id}`:b.key!,snapshot:{source_request_id:b.kind==='request'?b.id:null,record_id:recordId,management_no:b.managementNo,usage_end:b.end,pickup_date:remote?String(remote.record['集荷_日付']?.value??''):b.pickup,source_kind:b.kind}};
}
