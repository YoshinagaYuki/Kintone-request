import {samePortalOrigin} from '@/lib/company-portal/origin';
import {NextResponse} from 'next/server';
import {revalidatePath} from 'next/cache';
import {portalAdmin,portalManagement,PORTAL_HEADERS} from '@/lib/company-portal/server';
import {companyKey} from '@/lib/company-portal/company-name';
import {issuePortalToken} from '@/lib/company-portal/token';
export async function GET(){const a=await portalAdmin();if(!a)return NextResponse.json({error:'管理者権限が必要です'},{status:403});try{return NextResponse.json(await portalManagement(),{headers:PORTAL_HEADERS});}catch{return NextResponse.json({error:'企業URLを取得できませんでした'},{status:503,headers:PORTAL_HEADERS});}}
export async function POST(req:Request){const a=await portalAdmin();if(!a)return NextResponse.json({error:'管理者権限が必要です'},{status:403});if(!samePortalOrigin(req))return NextResponse.json({error:'この操作は管理画面から行ってください'},{status:403});
 try{const b=await req.json();if(!['issue','rotate','revoke'].includes(b.action))throw Error('操作内容を確認してください');if(b.action==='issue'&&(typeof b.company!=='string'||!companyKey(b.company)||b.company.trim().length>200||/[\x00-\x1f\x7f]/.test(b.company)))throw Error('企業名を200文字以内で入力してください');if(b.action!=='issue'&&(typeof b.id!=='string'||! /^[0-9a-f-]{36}$/i.test(b.id)||typeof b.updatedAt!=='string'))throw Error('企業URLを選択してください');
 const token=b.action==='revoke'?null:issuePortalToken(process.env.SUPABASE_SERVICE_ROLE_KEY!);const r=await a.db.rpc('manage_company_portal',{p_actor:a.actor,p_action:b.action,p_id:b.action==='issue'?crypto.randomUUID():b.id,p_name:b.action==='issue'?b.company.trim():null,p_hash:token?.hash??null,p_secret:token?.encrypted??null,p_expected:b.updatedAt??null});
 if(r.error)return NextResponse.json({error:r.error.message.includes('portal_stale')?'他の変更があります。最新の一覧から再度操作してください':r.error.code==='23505'?'この企業のURLはすでにあります。下の一覧からコピー、再発行できます':'企業URLを保存できませんでした'},{status:409,headers:PORTAL_HEADERS});
 revalidatePath('/admin/company-portals');return NextResponse.json({ok:true,...await portalManagement()},{headers:PORTAL_HEADERS});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'入力内容を確認してください'},{status:400,headers:PORTAL_HEADERS});}
}
