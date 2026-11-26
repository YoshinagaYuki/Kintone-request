import {createAdminClient} from '@/lib/supabase/admin';
import {savedRentalItems} from '@/lib/inventory/rental-items';
import {reviewAccess} from '@/lib/staff-review/server';
import {reviewFields} from '@/lib/staff-review/model';
import {StaffReviewPage} from '@/components/review/staff-review-page';
export const dynamic='force-dynamic';
export const metadata={title:'レンタル申請の確認',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function ReviewPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params,access=await reviewAccess(token);
 if(!access)return <main className="mx-auto max-w-xl px-6 py-20"><h1 className="text-xl font-bold">確認リンクを開けません</h1><p className="mt-4 leading-7 text-slate-600">有効期限が切れているか、リンクが更新されています。ユニティの営業窓口へ再送をご依頼ください。</p></main>;
 const q=access.request;const db=createAdminClient();const plans=await db.from('rental_plans').select('id,name').eq('is_active',true).order('sort_order');const kits=(q.form_types as any)?.kintone_app_id===49?await db.from('item_name_master').select('id,name,is_active').eq('category','tezukuru').eq('inventory_role','rental_kit'): {data:[]};
 const ft=q.form_types as unknown as {name:string;parser_config:{select_fields?:{label:string;options:string[]}[]}};
 return <StaffReviewPage key={`${q.updated_at}:${q.staff_review_revision}:${q.staff_review_state}`} token={token} rentalPlans={plans.data??[]} rentalChoices={(kits.data??[]).filter(i=>i.is_active!==false)} rentalItems={savedRentalItems(q.parsed_data??{},kits.data??[]).map(l=>({item_id:l.item_id,name:l.name,quantity:l.quantity}))} role={access.role} state={q.staff_review_state} status={q.status} revision={q.staff_review_revision} updatedAt={q.updated_at} fields={reviewFields(q.parsed_data??{})} applicant={{name:q.applicant_name??'',phone:q.applicant_phone??'',email:q.applicant_email??''}} staffName={q.company_staff_name_input??''} reason={access.review.reason} formName={ft?.name??'レンタル'} customerRequests={q.customer_requests??''} rentalStatus={q.rental_status} rentalPlanId={q.requested_rental_plan_id} structured={q.is_structured===true} sns={q.sns_promotion_requested===true} choices={(ft?.parser_config?.select_fields??[]).map(f=>({label:f.label,options:f.options??[]}))}/>;
}
