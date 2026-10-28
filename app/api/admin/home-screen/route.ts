import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {getCurrentAdmin,isActiveAdmin} from '@/lib/admin-users';
import {HOME_PAGES} from '@/lib/home-screen';
export async function PUT(request:Request){
 const supabase=await createClient();const admin=await getCurrentAdmin(supabase);
 if(!isActiveAdmin(admin))return NextResponse.json({error:'ログインし直してください。'},{status:403});
 const body=await request.json().catch(()=>null);
 if(!HOME_PAGES.some(p=>p.path===body?.path))return NextResponse.json({error:'起動先を選択してください。'},{status:400});
 const {error}=await supabase.auth.updateUser({data:{home_start_path:body.path}});
 if(error)return NextResponse.json({error:'保存できませんでした。もう一度お試しください。'},{status:500});
 return NextResponse.json({ok:true});
}
