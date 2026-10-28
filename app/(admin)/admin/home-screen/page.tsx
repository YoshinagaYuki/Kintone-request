import {createClient} from '@/lib/supabase/server';
import {homePage} from '@/lib/home-screen';
import {HomeScreenSettings} from '@/components/admin/home-screen-settings';
export const dynamic='force-dynamic';
export default async function HomeScreenPage(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 return <main className="mx-auto max-w-2xl px-4 py-7 sm:py-10"><h1 className="text-xl font-bold text-slate-900">ホーム画面の設定</h1><p className="mb-6 mt-2 text-sm leading-6 text-slate-500">スマホのホーム画面のアイコンから開くページを選べます。</p><HomeScreenSettings initial={homePage(user?.user_metadata?.home_start_path)}/></main>;
}
