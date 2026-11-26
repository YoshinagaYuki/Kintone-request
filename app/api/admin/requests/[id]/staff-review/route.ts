import {randomBytes} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {reviewHash} from '@/lib/staff-review/server';
import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {getCurrentAdmin,isActiveAdmin} from '@/lib/admin-users';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendStaffReviewMail} from '@/lib/staff-review/server';
export const maxDuration=60;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'送信元が不正です'},{status:403});
 const {id}=await params,session=await createClient(),me=await getCurrentAdmin(session);if(!isActiveAdmin(me))return NextResponse.json({error:'権限がありません'},{status:403});const db=createAdminClient(),q=await db.from('requests').select('form_type_id,staff_review_state').eq('id',id).single();if(q.error)return NextResponse.json({error:'申請が見つかりません'},{status:404});const grant=await db.from('admin_user_businesses').select('form_type_id').eq('admin_user_id',me.id).eq('form_type_id',q.data.form_type_id).maybeSingle();if(grant.error||!grant.data)return NextResponse.json({error:'担当事業の管理者のみ操作できます'},{status:403});try{const text=await req.text();if(text.length>3000)throw Error('入力内容が長すぎます');const body=text?JSON.parse(text):{action:'resend'};
 if(body.action==='override'||body.action==='link'){
 if(!Number.isSafeInteger(body.revision))throw Error('画面を更新してください');
 const token=body.action==='link'?randomBytes(32).toString('hex'):null;
 const result=await db.rpc('admin_staff_review_action',{p_id:id,p_actor:me.auth_user_id,p_revision:body.revision,p_action:body.action,p_reason:body.reason??'',p_hash:token?reviewHash(token):null,p_role:body.role??'reviewer'});
 if(result.error)throw Error(result.error.message);
 revalidatePath(`/admin/requests/${id}`);revalidatePath('/admin/requests');
 const base=(process.env.APP_BASE_URL??'https://kintone-request.vercel.app').replace(/\/$/,'');return NextResponse.json({ok:true,...(token?{url:`${base}/review/${token}`}:{})},{headers:{'Cache-Control':'no-store'}});
 }if(body.action!=='resend')throw Error('操作を確認してください');return NextResponse.json({sent:await sendStaffReviewMail(id,q.data.staff_review_state==='returned'?'requester':'reviewer',true)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'再送できませんでした'},{status:400});}
}
