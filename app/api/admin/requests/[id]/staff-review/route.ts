import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {getCurrentAdmin,isActiveAdmin} from '@/lib/admin-users';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendStaffReviewMail} from '@/lib/staff-review/server';
export const maxDuration=60;
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,session=await createClient(),me=await getCurrentAdmin(session);if(!isActiveAdmin(me))return NextResponse.json({error:'権限がありません'},{status:403});const db=createAdminClient(),q=await db.from('requests').select('form_type_id,staff_review_state').eq('id',id).single();if(q.error)return NextResponse.json({error:'申請が見つかりません'},{status:404});const grant=await db.from('admin_user_businesses').select('form_type_id').eq('admin_user_id',me.id).eq('form_type_id',q.data.form_type_id).maybeSingle();if(grant.error||!grant.data)return NextResponse.json({error:'担当事業の管理者のみ操作できます'},{status:403});try{return NextResponse.json({sent:await sendStaffReviewMail(id,q.data.staff_review_state==='returned'?'requester':'reviewer',true)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'再送できませんでした'},{status:400});}
}
