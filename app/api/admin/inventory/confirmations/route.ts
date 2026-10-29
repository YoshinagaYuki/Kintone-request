import{rentalMetadata}from'@/lib/inventory/rental-items';
import{tezukuruKitNames}from'@/lib/inventory/business';
import{getMinimumOrderQuantity}from'@/lib/system-settings';
import{NextRequest,NextResponse}from'next/server';
import{createHash}from'node:crypto';
import{revalidatePath}from'next/cache';
import{inventoryAccess}from'@/lib/inventory/access';
import{createAdminClient}from'@/lib/supabase/admin';
import{loadInventoryModel,type InventoryRecord}from'@/lib/inventory/model';
import{confirmationSource}from'@/lib/inventory/confirmation';
import{ALLMIGHT_FMT_LABELS as L,equipmentLabel}from'@/lib/allmight-fmt';
import{parseFmt}from'@/lib/parser/fmt-parser';
import{bookingPatch,slotSchedule,validateNumber}from'@/lib/inventory/operations';
import{assertScreenCapacity}from'@/lib/inventory/shared-screen';
import{isKintoneReady}from'@/lib/form-types';
import{withInventorySheetPush}from'@/lib/inventory/sheet-push';
export const maxDuration=60;
async function formConfig(db:ReturnType<typeof createAdminClient>,adminId:string,tezu=false){
 const f=await db.from('form_types').select('id,name,version,parser_config,field_mapping').eq('kintone_app_id',tezu?49:10).single();
 if(f.error||!isKintoneReady(f.data.field_mapping))throw Error('この事業の申請設定を確認してください');
 const grant=await db.from('admin_user_businesses').select('admin_user_id').eq('admin_user_id',adminId).eq('form_type_id',f.data.id).maybeSingle();
 if(grant.error||!grant.data)throw Error('この事業の管理権限が必要です');return f.data;
}
export async function GET(req:NextRequest){const a=await inventoryAccess();if('error'in a)return NextResponse.json({error:a.error},{status:a.status});try{
 const db=createAdminClient(),key=req.nextUrl.searchParams.get('key')??'';
 const previous=await db.from('inventory_confirmation_sources').select('request_id').eq('source_key',key).maybeSingle();if(previous.error)throw Error('本登録の設定を確認してください');if(previous.data)return NextResponse.json({existingRequestId:previous.data.request_id});
 const model=await loadInventoryModel(a.db,'','all'),p=confirmationSource(model,key),b=p.source.booking,tezu=model.items.find(i=>i.id===p.source.itemId)?.inventory_role==='rental_kit',f=await formConfig(db,a.admin.id,tezu);
 const clean=(s:string)=>s.normalize('NFKC').replace(/[\s()（）]/g,'');const staff=model.staff.filter(s=>clean(s.name).startsWith(clean(b.staff)));const names=p.records.map(r=>model.items.find(i=>i.id===r.itemId)!.name);
 if(tezu){const [plans,products]=await Promise.all([db.from('rental_plans').select('id,name,description,sort_order,is_active').eq('is_active',true).order('sort_order'),db.from('item_name_master').select('name,excluded_slots').eq('category','tezukuru').is('inventory_role',null).eq('is_active',true).order('sort_order')]);if(plans.error||products.error)throw Error('申請マスタを取得できません');return NextResponse.json({business:'tezukuru',formTypeId:f.id,version:model.version,baseline:p.baseline,staff:model.staff,deliveryRequired:b.deliveryRequired!==false,pickupRequired:b.pickupRequired!==false,lines:p.records.map((r,i)=>({name:names[i],number:r.booking.unitNumber??null})),formTypes:[{id:f.id,name:f.name,fmt_template:'',input_guide:'',notes:'',select_fields:[],has_rental_plan:true,is_tezukuru:true}],rentalPlans:plans.data,productItems:products.data.map(i=>({name:i.name,excludedSlots:i.excluded_slots??[]})),minimumOrderQuantity:await getMinimumOrderQuantity(db),initialValues:{applicantName:a.admin.display_name||'',applicantEmail:a.admin.email,companyStaffName:staff.length===1?staff[0].name:'',boothName:b.store,deliveryDate:b.delivery,pickupDate:b.pickup,billingMonth:`${Number(b.start.slice(5,7))}月分`,rentalStatus:'new_rental'}});}
 return NextResponse.json({formTypeId:f.id,version:model.version,baseline:p.baseline,staff:model.staff,deliveryRequired:b.deliveryRequired!==false,pickupRequired:b.pickupRequired!==false,lines:p.records.map((r,i)=>({name:names[i],number:r.booking.unitNumber??null})),initialValues:{applicantName:a.admin.display_name||'',applicantEmail:a.admin.email,companyStaffName:staff.length===1?staff[0].name:'',eventBooth:b.store,usageStart:b.start,usageEnd:b.end,deliveryDate:b.delivery,pickupDate:b.pickup,billingMonth:`${Number(b.start.slice(5,7))}月分`,equipments:names}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'本登録の情報を取得できません'},{status:400});}}
async function handler(req:NextRequest){const a=await inventoryAccess();if('error'in a)return NextResponse.json({error:a.error},{status:a.status});try{
 const text=await req.text();if(text.length>50000)throw Error('入力内容が長すぎます');const body=JSON.parse(text);
 if(!/^[0-9a-f-]{36}$/i.test(body.id??'')||typeof body.key!=='string'||typeof body.baseline!=='string'||typeof body.payload!=='object'||!body.payload)throw Error('入力情報を確認してください');
 const db=createAdminClient(),hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const prior=await db.from('inventory_confirmation_sources').select('request_id,input_hash,created_by').eq('request_id',body.id).limit(1).maybeSingle();if(prior.error)throw Error('本登録の設定を確認してください');
 if(prior.data){if(prior.data.input_hash!==hash||prior.data.created_by!==a.admin.auth_user_id)throw Error('保存済みの申請を確認してください');const r=await db.from('requests').select('status,deleted_at').eq('id',body.id).single();if(r.error||r.data.deleted_at)throw Error('保存済み申請を申請一覧から確認してください');return NextResponse.json({ok:true,requestId:body.id,status:r.data.status});}
 const model=await loadInventoryModel(a.db,'','all'),p=confirmationSource(model,body.key),b=p.source.booking,tezu=model.items.find(i=>i.id===p.source.itemId)?.inventory_role==='rental_kit',f=await formConfig(db,a.admin.id,tezu);
 if(body.baseline!==p.baseline)return NextResponse.json({code:'target_changed',latestBaseline:p.baseline,latest:p.records.map(r=>({name:model.items.find(i=>i.id===r.itemId)!.name,number:r.booking.unitNumber??null,store:r.booking.store,start:r.booking.start,end:r.booking.end})),deliveryRequired:b.deliveryRequired!==false,pickupRequired:b.pickupRequired!==false,error:'仮押さえの内容が変更されています。最新内容を確認してから保存してください。入力は保持しています。'},{status:409});
 const input=body.payload,staff=model.staff.find(s=>s.name===input.company_staff_name);if(!staff)throw Error('担当者マスターの正式名称を選択してください');
 for(const [key,max]of[['applicant_name',100],['applicant_phone',30],['applicant_email',254]]as const)if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>max)throw Error('入力者の氏名・電話番号・メールを入力してください');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.applicant_email))throw Error('メールアドレスを確認してください');
 if(input.customer_requests!=null&&(typeof input.customer_requests!=='string'||input.customer_requests.length>2000))throw Error('要望・連絡事項は2000文字までです');
 const deliveryRequired=b.deliveryRequired!==false,pickupRequired=b.pickupRequired!==false;
 const shipping=[...(!deliveryRequired?[L.deliveryDate,L.deliveryPostal,L.deliveryAddress,L.deliveryReceiver,L.deliveryContact]:[]),...(!pickupRequired?[L.pickupDate,L.pickupPostal,L.pickupAddress,L.pickupHandover,L.pickupContact]:[])];
 let rawText=input.raw_text;
 if(tezu){if(!['paid','free'].includes(input.billing_type))throw Error('料金区分を選択してください');const plan=await db.from('rental_plans').select('id,name').eq('id',input.rental_plan_id).eq('is_active',true).maybeSingle();if(!plan.data)throw Error('レンタルプランを選択してください');rawText=`レンタルプラン：${plan.data.name}\n${rawText}`;input.rental_status='new_rental';}
 const parsed=parseFmt(rawText,{...f.parser_config,required_labels:(f.parser_config?.required_labels??[]).filter((v:string)=>!shipping.includes(v as any))});if(!parsed.ok)throw Error(parsed.errors.join(' '));const data:Record<string,unknown>={...parsed.data};
 if(tezu){const min=await getMinimumOrderQuantity(db),products=await db.from('item_name_master').select('name,excluded_slots').eq('category','tezukuru').is('inventory_role',null).eq('is_active',true);let count=0;for(let i=1;i<=10;i++){const name=data[`コンテンツ${i}`],qty=data[`数量${i}`];if(!name&&!qty)continue;const item=products.data?.find(p=>p.name===name);if(!item||!/^\d+$/.test(String(qty))||Number(qty)<min||(item.excluded_slots??[]).includes(i))throw Error('教材の商品・数量・入力位置を確認してください');count++;}if(!count)throw Error('教材を入力してください');}

 for(const key of[L.agencyName,tezu?L.eventBoothName:L.eventBooth,L.billingMonth,...(deliveryRequired?[L.deliveryDate,L.deliveryPostal,L.deliveryAddress,L.deliveryReceiver,L.deliveryContact]:[]),...(pickupRequired?[L.pickupDate,L.pickupPostal,L.pickupAddress,L.pickupHandover,L.pickupContact]:[])])if(typeof data[key]!=='string'||!String(data[key]).trim())throw Error(`${key}を入力してください`);
 if(!/^(?:[1-9]|1[0-2])月分$/.test(String(data[L.billingMonth])))throw Error('請求対象月を選択してください');
 const names=p.records.map(r=>model.items.find(i=>i.id===r.itemId)!.name);if(tezu){const kitLines:any[]=[];for(const r of p.records){const line=kitLines.find(l=>l.item_id===r.itemId);if(line)line.quantity++;else kitLines.push({item_id:r.itemId,name:model.items.find(i=>i.id===r.itemId)!.name,quantity:1});}Object.assign(data,rentalMetadata(kitLines));}else for(let i=1;i<=5;i++)if(String(data[equipmentLabel(i)]??'')!==(names[i-1]??''))throw Error('商品は仮押さえの編集画面で変更してから本登録してください');
 for(const key of shipping)delete data[key];
 const patch=bookingPatch({item_id:p.source.itemId,staff:staff.name,store:data[tezu?L.eventBoothName:L.eventBooth],start:tezu?b.start:data[L.usageStart],end:tezu?b.end:data[L.usageEnd],delivery:data[L.deliveryDate]??'',pickup:data[L.pickupDate]??'',deliveryRequired,pickupRequired,from:[String(tezu?b.start:data[L.usageStart]),String(data[L.deliveryDate]??'')].filter(Boolean).sort()[0],to:[String(tezu?b.end:data[L.usageEnd]),String(data[L.pickupDate]??'')].filter(Boolean).sort().at(-1)});
 if(tezu&&((patch.delivery&&patch.delivery>patch.start)||(patch.pickup&&patch.pickup<patch.end)))throw Error('納品日は利用開始日以前、集荷日は利用終了日以降にしてください');
 // Preserve explicitly reserved transit/inspection padding if usage/shipping dates are unchanged.
 if(patch.start===b.start&&patch.end===b.end&&patch.delivery===b.delivery&&patch.pickup===b.pickup){patch.from=b.from;patch.to=b.to;}
 if(tezu){data._inventory_usage_start=patch.start;data._inventory_usage_end=patch.end;}const keys=p.records.map(r=>r.booking.key!);Object.assign(data,{[L.eventBoothName]:patch.store,'担当者':staff.name,_inventory_delivery_required:deliveryRequired,_inventory_pickup_required:pickupRequired,_inventory_confirmation_keys:keys});
 const candidates:InventoryRecord[]=p.records.map((r,i)=>({itemId:r.itemId,booking:{...r.booking,...patch,key:`request:${body.id}:${i}`,id:body.id,group:`${body.id}:${i}`,kind:'request',managementNo:'',status:'hold'}}));
 const existing=model.records.filter(r=>!keys.includes(r.booking.key!));for(const r of candidates)validateNumber(model,r,r.booking.unitNumber??null);assertScreenCapacity(model,candidates,existing);
 const slots=candidates.map((r,i)=>({slot:i,source_key:keys[i],item_id:r.itemId,unit_number:r.booking.unitNumber??null,patch:{from:patch.from,to:patch.to,deliveryRequired,pickupRequired,screenQuantity:r.booking.screenQuantity??0}}));
 const saved=await db.rpc('create_inventory_confirmation',{p_actor:a.admin.auth_user_id,p_id:body.id,p_hash:hash,p_expected:model.version,p_form:f.id,p_version:f.version,p_parsed:data,p_raw:rawText,p_input:{...input,staff:staff.name},p_slots:slots,p_candidate:slotSchedule(candidates),p_existing:slotSchedule(existing)});
 if(saved.error){if(saved.error.message.includes('inventory_stale'))return NextResponse.json({code:'inventory_stale',error:'在庫の更新を確認しています。入力は保持しています。'},{status:409});if(saved.error.message.includes('source_already_confirmed')||saved.error.code==='23505')throw Error('この仮押さえは本登録の申請が作成済みです。申請一覧を確認してください');if(saved.error.message.includes('inventory_conflict'))throw Error('機器番号が別の予定と重なっています。日程・機器番号を確認してください');throw Error('申請を保存できませんでした。入力は保持しています');}
 revalidatePath('/admin/inventory/allmight');revalidatePath('/admin/inventory/tezukuru');revalidatePath('/admin/requests');return NextResponse.json({ok:true,requestId:body.id,status:'pending'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'入力内容を確認してください'},{status:400});}}
export const POST=withInventorySheetPush(handler);
