import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendMail} from '@/lib/mail/mailer';
import {validReviewToken,reviewBlocksRegistration} from './model';
export const reviewHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function reviewAccess(token:string){
 if(!validReviewToken(token))return null;
 const db=createAdminClient(),hash=reviewHash(token);
 const r=await db.from('request_staff_reviews').select('*').or(`reviewer_token_hash.eq.${hash},requester_token_hash.eq.${hash}`).maybeSingle();
 if(r.error||!r.data||Date.parse(r.data.expires_at)<Date.now())return null;
 const [request,staff]=await Promise.all([db.from('requests').select('*,form_types(name,kintone_app_id,parser_config)').eq('id',r.data.request_id).is('deleted_at',null).maybeSingle(),db.from('staff_members').select('id,name,email,is_active').eq('id',r.data.staff_id).single()]);
 if(request.error||!request.data||staff.error||!staff.data.is_active||staff.data.email!==r.data.reviewer_email||request.data.staff_review_staff_id!==staff.data.id)return null;
 return {hash,role:r.data.reviewer_token_hash===hash?'reviewer' as const:'requester' as const,review:r.data,request:request.data,staff:staff.data};
}
/** No customer mail is sent by tests; callers use this only for the user's configured workflow. */
export async function sendStaffReviewMail(requestId:string,role:'reviewer'|'requester'='reviewer',force=false){
 const db=createAdminClient();const [q,r]=await Promise.all([db.from('requests').select('id,status,deleted_at,staff_review_state,staff_review_revision,applicant_name,applicant_email,company_staff_name_input,form_types(name)').eq('id',requestId).maybeSingle(),db.from('request_staff_reviews').select('reviewer_email,reason').eq('request_id',requestId).maybeSingle()]);
 if(q.error||r.error)throw Error('担当者確認の状態を取得できません');if(!q.data||!r.data||q.data.deleted_at||!reviewBlocksRegistration(q.data.staff_review_state))return false;
 const token=randomBytes(32).toString('hex'),hash=reviewHash(token),claim=await db.rpc('claim_staff_review_mail',{p_id:requestId,p_role:role,p_hash:hash,p_force:force});if(claim.error)throw Error('確認メールを準備できません');if(!claim.data)return false;
 const base=(process.env.APP_BASE_URL??'https://kintone-request.vercel.app').replace(/\/$/,'');const url=`${base}/review/${token}`;
 const type=(q.data.form_types as unknown as {name:string})?.name??'レンタル';
 const reviewer=role==='reviewer',to=reviewer?claim.data.email:q.data.applicant_email;
 const subject=reviewer?`【${type}】申請内容の確認・承認をお願いします`:`【${type}】申請内容の修正をお願いします`;
 const text=reviewer?`${q.data.company_staff_name_input} 様\n\n${q.data.applicant_name??'申請者'}様から申請が届きました。\n下記の専用ページで内容を確認し、問題がなければ「承認」を押してください。\n誤りがある場合は「差し戻し」または「修正」を選択できます。\n\n${url}\n\n担当者の承認後、ユニティ管理者が最終承認して本登録します。\nこのリンクは申請内容を閲覧できます。転送・共有しないでください。有効期限は30日です。`:`${q.data.applicant_name??'ご担当者'} 様\n\n担当者から申請内容の修正依頼が届きました。\n\n【差し戻し理由】\n${r.data.reason}\n\n下記から内容を修正して再申請してください。\n${url}\n\n再申請後、担当者が改めて確認します。リンクは転送・共有しないでください。有効期限は30日です。`;
 const result=to?await sendMail({to,subject,text,skipAlwaysCc:true}):{sent:false as const,error:'申請者のメールアドレスが未入力です'};
 const error=result.sent?null:'error'in result?result.error:'メール送信が設定されていません';
 const update=reviewer?{reviewer_sending_at:null,reviewer_mail_error:error,...(result.sent?{reviewer_sent_revision:claim.data.revision}:{})}:{requester_sending_at:null,requester_mail_error:error,...(result.sent?{requester_sent_revision:claim.data.revision}:{})};
 const saved=await db.from('request_staff_reviews').update(update).eq('request_id',requestId).eq(reviewer?'reviewer_token_hash':'requester_token_hash',hash);if(saved.error)throw Error('送信結果を記録できません');
 await db.from('request_histories').insert({request_id:requestId,action:result.sent?'email_sent':'email_failed',actor:'system',detail:{kind:reviewer?'staff_review':'staff_review_return',revision:claim.data.revision,...(error?{error}:{})}});
 return result.sent;
}
export async function ensureStaffReview(requestId:string,notify=false){const db=createAdminClient();const q=await db.from('requests').select('staff_review_state').eq('id',requestId).single();if(q.error)throw Error('担当者確認の状態を取得できません');if(reviewBlocksRegistration(q.data.staff_review_state)){if(notify)await sendStaffReviewMail(requestId);return true;}return false;}
