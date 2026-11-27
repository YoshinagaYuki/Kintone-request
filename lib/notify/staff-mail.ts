import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendRequestNotificationMail} from './request-mail';
import {assignedStaffRecipient,RENTAL_REQUIRED_CC} from '@/lib/mail/rental-notification-policy';
import {newRequestSubject,newRequestBody} from './new-request-mail-content';
import type {NewRequestNotification} from './notify';
/** The assigned staff member always receives request notices; review_required only controls approval. */
export async function sendStaffNewRequestMail(n:NewRequestNotification):Promise<void>{
 const db=createAdminClient();try{
  const result=await db.from('staff_members').select('name,email,is_active').eq('is_active',true);if(result.error)throw Error('担当者マスタを取得できませんでした');
  const email=assignedStaffRecipient(n.staffNameInput??'',result.data??[]);
  const sent=await sendRequestNotificationMail(n,{to:email,subject:newRequestSubject(n),text:newRequestBody(n),skipAlwaysCc:true});
  if('error'in sent)console.error('[staff-mail] 担当者への通知を送信できませんでした');
 }catch(error){
  console.error('[staff-mail] 担当者への通知を準備できませんでした');
  if(n.requestId)await db.from('request_histories').insert({request_id:n.requestId,action:'email_failed',actor:'system',detail:{kind:'assigned_staff_notice',staff_name:n.staffNameInput,cc:[RENTAL_REQUIRED_CC],error:error instanceof Error?error.message:'担当者通知に失敗しました'}});
 }
}
