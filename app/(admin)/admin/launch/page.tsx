import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {homePage} from '@/lib/home-screen';
export const dynamic='force-dynamic';
export default async function LaunchPage(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 redirect(homePage(user?.user_metadata?.home_start_path));
}
