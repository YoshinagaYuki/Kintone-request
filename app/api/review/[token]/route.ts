import {scheduleInventorySheetPush} from '@/lib/inventory/sheet-push';
import {notifyNewRequest} from '@/lib/notify/notify';
import {NextRequest,NextResponse} from 'next/server';
import {reviewAccess,sendStaffReviewMail} from '@/lib/staff-review/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {editPendingRequest} from '@/lib/requests/edit-pending';
import {revalidatePath} from 'next/cache';
export const maxDuration=60;
export async function POST(req:NextRequest,{params}:{params:Promise<{token:string}>}){
 try{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return NextResponse.json({error:'送信元が不正です'},{status:403});const {token}=await params,access=await reviewAccess(token);if(!access)return NextResponse.json({error:'確認リンクが無効か、有効期限が切れています'},{status:403});
 const raw=await req.text();if(raw.length>45000)throw Error('入力内容が長すぎます');const body=JSON.parse(raw);if(!Number.isSafeInteger(body.revision)||typeof body.updated_at!=='string')throw Error('画面を再読み込みしてください');
 if(body.action==='edit'){const payload=body.payload;if(!payload||payload.expected_updated_at!==body.updated_at)throw Error('画面を再読み込みしてください');const response=await editPendingRequest(new NextRequest(req.url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),{params:Promise.resolve({id:access.request.id})},token);if(response.ok){scheduleInventorySheetPush();revalidatePath('/admin/requests');revalidatePath(`/admin/requests/${access.request.id}`);revalidatePath('/admin/inventory/allmight');revalidatePath('/admin/inventory/tezukuru');}return response;}
 if(access.role!=='reviewer'||!['approve','return'].includes(body.action))return NextResponse.json({error:'この操作はできません'},{status:403});
 const result=await createAdminClient().rpc('act_staff_request_review',{p_hash:access.hash,p_revision:body.revision,p_updated:body.updated_at,p_action:body.action,p_reason:typeof body.reason==='string'?body.reason:''});if(result.error)return NextResponse.json({error:result.error.message},{status:409});
 if(body.action==='approve'){const q=access.request;const base=(process.env.APP_BASE_URL??'https://kintone-request.vercel.app').replace(/\/$/,'');await notifyNewRequest({skipStaffNotification:true,formTypeId:q.form_type_id,formTypeName:`${(q.form_types as any)?.name??'レンタル'}（担当者承認済み）`,applicantName:q.applicant_name??'',agencyName:q.parsed_data?.['取次店名']??'',boothName:q.parsed_data?.['イベントブース名']??q.parsed_data?.['イベントブース']??'',deliveryDate:q.parsed_data?.['配送日付']??'',pickupDate:q.parsed_data?.['集荷日付']??'',submittedAt:q.created_at,adminUrl:`${base}/admin/requests/${q.id}`,staffNameInput:q.company_staff_name_input??''});}
 let mailSent=false;if(body.action==='return')mailSent=await sendStaffReviewMail(access.request.id,'requester').catch(()=>false);
 revalidatePath(`/admin/requests/${access.request.id}`);revalidatePath('/admin/requests');return NextResponse.json({ok:true,mailSent});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'処理できませんでした'},{status:400});}
}
