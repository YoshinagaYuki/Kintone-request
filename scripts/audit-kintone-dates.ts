/** Read-only audit. Never updates requests, Kintone, shipping, or sends notifications. */
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {loadEnvLocal,requireEnv} from './load-env';
import {findRecords} from '../lib/kintone/client';
import {requestDateSnapshot,RENTAL_DATE_FIELDS,SHIPPING_DATE_FIELDS} from '../lib/kintone/request-dates';

loadEnvLocal();
async function audit(){
 const db=createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'),requireEnv('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const requests:any[]=[];
 for(let offset=0;;offset+=1000){const r=await db.from('requests').select('id,management_no,kintone_record_id,form_type_id,status,parsed_data,deleted_at').range(offset,offset+999);if(r.error)throw Error('申請データの取得に失敗しました');requests.push(...r.data);if(r.data.length<1000)break;}
 const [forms,copies,extensions]=await Promise.all([db.from('form_types').select('id,kintone_app_id'),db.from('inventory_copy_requests').select('state,progress,source_snapshot'),db.from('inventory_extensions').select('state,parent_request_id')]);
 if(forms.error||copies.error||extensions.error)throw Error('連携設定の取得に失敗しました');
 const cancelled=new Set((copies.data??[]).filter(j=>j.state==='complete'&&j.progress?.oldPickupCancelled).map(j=>String(j.source_snapshot?.management_no)));
 const apps=new Map<number,Awaited<ReturnType<typeof findRecords>>>();
 for(const app of [10,11]){const rows:Awaited<ReturnType<typeof findRecords>>=[];let last=0;for(;;){const batch=await findRecords(app,`$id > ${last} order by $id asc limit 500`,['$id','$revision','管理番号','手配種別','集荷_手配種別',...(app===11?SHIPPING_DATE_FIELDS:RENTAL_DATE_FIELDS)]);rows.push(...batch);if(batch.length<500)break;last=Number(batch.at(-1)?.$id?.value);}apps.set(app,rows);}
 const allmightForms=new Set(forms.data?.filter(f=>f.kintone_app_id===10).map(f=>f.id));
 const relevant=requests.filter(r=>allmightForms.has(r.form_type_id));
 const rows=relevant.filter(r=>r.kintone_record_id).map(r=>{
  const app=forms.data?.find(f=>f.id===r.form_type_id)?.kintone_app_id;
  const source=apps.get(app)?.find(v=>String(v.$id?.value)===String(r.kintone_record_id));
  const shipping=apps.get(11)?.filter(v=>String(v['管理番号']?.value)===String(r.management_no))??[];
  const expected=requestDateSnapshot(r.parsed_data??{},app);
  const pickupCancelled=cancelled.has(String(r.management_no))||(extensions.data??[]).some(e=>e.state==='complete'&&e.parent_request_id===r.id);
  if(pickupCancelled)expected['集荷_日付']='';
  const differences=source?Object.entries(expected).filter(([code,date])=>String(source[code]?.value??'')!==date).map(([code,expected])=>({code,system:expected,kintone:String(source[code]?.value??'')})):[];
  const shippingDifferences=source?shipping.flatMap(v=>SHIPPING_DATE_FIELDS.filter(k=>String(v[k]?.value??'')!==String(source[k]?.value??'')).map(code=>({code,shippingId:String(v.$id?.value),arrangement:String(v['集荷_手配種別']?.value??''),source:String(source[code]?.value??''),shipping:String(v[code]?.value??'')}))):[];
  return{id:r.id,managementNo:r.management_no,app,recordId:r.kintone_record_id,status:r.status,deleted:!!r.deleted_at,exists:!!source,identityMatches:!!source&&String(source['管理番号']?.value??'')===String(r.management_no),shippingCount:shipping.length,pickupCancelled,differences,shippingDifferences};
 });
 const extensionParents=(copies.data??[]).filter(j=>j.state==='complete'&&j.progress?.oldPickupCancelled).map(j=>{
   const no=String(j.source_snapshot.management_no),source=apps.get(10)?.find(r=>String(r.$id?.value)===String(j.source_snapshot.record_id)),shipping=apps.get(11)?.filter(r=>String(r['管理番号']?.value)===no)??[];
   const stale=[...(source?[{app:10,record:source}]:[]),...shipping.map(record=>({app:11,record}))].filter(({record})=>String(record['集荷_日付']?.value??'')!==''||String(record['集荷_手配種別']?.value??'')!=='手配不要').map(({app,record})=>({app,id:String(record.$id?.value),pickup:String(record['集荷_日付']?.value??''),arrangement:String(record['集荷_手配種別']?.value??'')}));
   return{managementNo:no,exists:!!source,shippingCount:shipping.length,stale};
 });
 const active=rows.filter(r=>!r.deleted&&r.exists);
 const report={checkedAt:new Date().toISOString(),readOnly:true,business:"allmight",totalRequests:relevant.length,linked:rows.length,present:active.length,deletedMissing:rows.filter(r=>r.deleted&&!r.exists).length,unlinked:relevant.length-rows.length,sourceDateDifferences:active.filter(r=>r.differences.length).length,shippingDateDifferences:active.filter(r=>r.shippingDifferences.length).length,identityIssues:active.filter(r=>!r.identityMatches||r.shippingCount!==1).length,extensionParentsChecked:extensionParents.length,extensionParentIssues:extensionParents.filter(r=>r.stale.length||!r.exists||r.shippingCount!==1).length,extensionParents,rows};
 const out=process.argv.indexOf('--out');if(out>=0&&process.argv[out+1])writeFileSync(process.argv[out+1],JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({...report,rows:rows.filter(r=>r.differences.length||r.shippingDifferences.length||!r.exists||!r.identityMatches||r.shippingCount!==1)},null,2));
}
audit().catch(()=>{console.error('日程監査を完了できませんでした。データは変更していません。');process.exitCode=1;});
