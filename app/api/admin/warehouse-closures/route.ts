import {NextResponse} from 'next/server';
import {revalidatePath} from 'next/cache';
import {inventoryAccess} from '@/lib/inventory/access';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadWarehouseCalendar} from '@/lib/inventory/warehouse-calendar-server';
import {validDate} from '@/lib/inventory/gantt';
export async function GET(){const a=await inventoryAccess();if('error'in a)return NextResponse.json({error:a.error},{status:a.status});try{return NextResponse.json(await loadWarehouseCalendar(a.db),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'倉庫休業日を取得できませんでした'},{status:503});}}
export async function PUT(req:Request){
 const a=await inventoryAccess();if('error'in a)return NextResponse.json({error:a.error},{status:a.status});
 try{const b=await req.json();if(typeof b.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)||typeof b.cancel!=='boolean'||!Number.isSafeInteger(b.version))throw Error('保存内容を確認してください');
 if(!b.cancel&&(!validDate(b.start_date)||!validDate(b.end_date)||b.start_date<'2000-01-01'||b.end_date>'2100-12-31'||b.end_date<b.start_date||(Date.parse(b.end_date)-Date.parse(b.start_date))/86400000>366||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100))throw Error('休暇名と開始日・終了日を確認してください（1回の登録は最長367日）');
 const r=await createAdminClient().rpc('save_warehouse_closure',{p_actor:a.admin.auth_user_id,p_id:b.id,p_start:b.cancel?null:b.start_date,p_end:b.cancel?null:b.end_date,p_name:b.cancel?null:b.name.trim(),p_cancel:b.cancel,p_expected:b.version});
 if(r.error)return NextResponse.json({error:r.error.message.includes('inventory_stale')?'他の変更が保存されました。最新状態を読み直して、もう一度保存してください':'倉庫休業日を保存できませんでした',stale:r.error.message.includes('inventory_stale')},{status:409});
 revalidatePath('/admin','layout');return NextResponse.json({ok:true,...await loadWarehouseCalendar(a.db)});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'入力内容を確認してください'},{status:400});}
}
