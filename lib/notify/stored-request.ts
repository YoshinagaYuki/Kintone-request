import 'server-only';
import {createAdminClient} from '../supabase/admin';
import {notifyNewRequest} from './notify';
export async function notifyStoredRequest(id:string,kind:'internal'|'extension'){
 const db=createAdminClient();try{
  const q=await db.from('requests').select('id,form_type_id,created_at,applicant_name,company_staff_name_input,approved_staff_name,parsed_data,form_types(name)').eq('id',id).single();if(q.error)throw Error('保存済み申請の通知内容を取得できません');
  const r=q.data,p=r.parsed_data??{},f=r.form_types as unknown as {name:string};
  await notifyNewRequest({requestId:id,notificationKind:kind,formTypeId:r.form_type_id,formTypeName:f?.name??'レンタル',applicantName:r.applicant_name??'',agencyName:p['取次店名']??'',boothName:p['イベントブース名']??p['イベントブース']??'',deliveryDate:p['配送日付']??'',pickupDate:p['集荷日付']??'',submittedAt:r.created_at,adminUrl:`${(process.env.APP_BASE_URL??'https://kintone-request.vercel.app').replace(/\/$/,'')}/admin/requests/${id}`,staffNameInput:r.company_staff_name_input||r.approved_staff_name||''});
 }catch{await db.from('request_histories').insert({request_id:id,action:'email_failed',actor:'system',detail:{kind:'internal_notice',error:'通知を完了できませんでした。申請内容は保存済みです。'}});}
}
