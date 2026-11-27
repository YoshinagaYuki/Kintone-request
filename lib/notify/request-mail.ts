import 'server-only';
import {createAdminClient} from '../supabase/admin';
import {sendMail,type MailInput,type MailResult} from '../mail/mailer';
import {RENTAL_REQUIRED_CC} from '../mail/rental-notification-policy';
import type {NewRequestNotification} from './notify';
/** SMTP errors are recorded without changing the saved request's success. */
export async function sendRequestNotificationMail(n:NewRequestNotification,input:MailInput):Promise<MailResult>{
 const db=createAdminClient(),kind=n.notificationKind??'submitted';let lease:string|null=null;
 try{
  if(n.requestId){const claim=await db.rpc('claim_request_notification',{p_id:n.requestId,p_kind:kind,p_recipient:input.to});if(claim.error)throw Error('通知メールの重複確認に失敗しました');lease=claim.data;if(!lease)return{sent:false,skipped:true};}
  const result=await sendMail({...input,cc:[...(Array.isArray(input.cc)?input.cc:input.cc?[input.cc]:[]),RENTAL_REQUIRED_CC]});
  const error=result.sent?null:'error'in result?result.error:'メール送信が設定されていません';
  if(n.requestId){
   const saved=await db.from('request_notification_deliveries').update({sending_at:null,error,...(result.sent?{sent_at:new Date().toISOString()}:{})}).eq('request_id',n.requestId).eq('kind',kind).eq('recipient',input.to.trim().toLowerCase()).eq('lease',lease);if(saved.error)console.error('[notify-mail] 送信結果の記録に失敗しました');
   await db.from('request_histories').insert({request_id:n.requestId,action:result.sent?'email_sent':'email_failed',actor:'system',detail:{kind:`request_notice:${kind}`,to:input.to,cc:[RENTAL_REQUIRED_CC],...(error?{error}:{})}});
  }
  return result;
 }catch(error){console.error('[notify-mail] 通知の準備に失敗しました');return{sent:false,error:error instanceof Error?error.message:'通知メールを送信できませんでした'};}
}
