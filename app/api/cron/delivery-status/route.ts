import {inventoryEnabled} from '@/lib/inventory/access';
import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {autoCheckDeliveries} from '@/lib/inventory/delivery-auto-server';
import {addDays} from '@/lib/inventory/gantt';
export const maxDuration=120;
export async function POST(req:NextRequest){
 const token=req.headers.get('x-delivery-automation-token')??'';
 if(!/^[a-f0-9]{64}$/.test(token))return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data,error}=await createAdminClient().from('inventory_delivery_automation_config').select('token,enabled').eq('singleton',true).single();
 if(error||!data||data.token.length!==token.length||!timingSafeEqual(Buffer.from(data.token),Buffer.from(token)))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!inventoryEnabled())return NextResponse.json({error:'Disabled'},{status:503});
 if(!data.enabled)return NextResponse.json({enabled:false});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
 try{let failed=false;for(const business of ['allmight','tezukuru']as const){try{await autoCheckDeliveries(business,addDays(today,-30),today);}catch{failed=true;}}return NextResponse.json({ok:!failed},{status:failed?503:200});}
 catch{return NextResponse.json({error:'Automatic delivery check failed'},{status:503});}
}
