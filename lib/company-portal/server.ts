import 'server-only';
import {createAdminClient} from '../supabase/admin';
import {createClient} from '../supabase/server';
import {getCurrentAdmin,isActiveAdmin} from '../admin-users';
import {companyKey} from './company-name';
import {openPortalToken,portalTokenHash,validPortalToken} from './token';
import {companyRows,type CompanyRequest} from './report';
export const PORTAL_HEADERS={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export async function portalAdmin(){const db=await createClient(),admin=await getCurrentAdmin(db);return isActiveAdmin(admin)?{db:createAdminClient(),actor:admin.auth_user_id}:null;}
export async function portalRequests(key:string){
 const db=createAdminClient(),rows:CompanyRequest[]=[];
 for(let offset=0;offset<=20000;offset+=500){const r=await db.from('requests').select('id,company_name,management_no,parsed_data,approved_contents,form_types!inner(kintone_app_id)').eq('portal_company_key',key).eq('status','registered').is('deleted_at',null).in('form_types.kintone_app_id',[10,49]).order('id').range(offset,offset+499);if(r.error)throw Error('レンタル一覧を取得できませんでした');rows.push(...(r.data??[]) as CompanyRequest[]);if((r.data?.length??0)<500)return rows;if(rows.length>20000)break;}
 throw Error('対象件数が表示上限を超えています。管理者にお問い合わせください');
}
export async function resolvePortal(token:string){if(!validPortalToken(token))return null;const r=await createAdminClient().from('company_portals').select('id,company_key,display_name').eq('token_hash',portalTokenHash(token)).is('revoked_at',null).maybeSingle();if(r.error)throw Error('企業ページを確認できませんでした');return r.data;}
export async function publicPortalReport(token:string,month:string){const portal=await resolvePortal(token);if(!portal)return null;const data=companyRows(await portalRequests(portal.company_key),portal.company_key,month);return {name:portal.display_name,...data};}
export async function portalManagement(){
 const db=createAdminClient();const portals=await db.from('company_portals').select('id,company_key,display_name,created_at,updated_at,revoked_at,token_ciphertext').order('created_at',{ascending:false}).limit(1001);if(portals.error||(portals.data?.length??0)>1000)throw Error('企業URLの一覧を取得できませんでした');
 const companies=new Map<string,{key:string;name:string;variants:string[];registered:number}>();
 for(let offset=0;offset<=20000;offset+=500){const r=await db.from('requests').select('company_name,status,form_types!inner(kintone_app_id)').is('deleted_at',null).not('company_name','is',null).in('form_types.kintone_app_id',[10,49]).order('id').range(offset,offset+499);if(r.error)throw Error('企業名一覧を取得できませんでした');for(const row of r.data??[]){const name=row.company_name?.trim()||'',key=companyKey(name);if(!key)continue;const c=companies.get(key)??{key,name,variants:[] as string[],registered:0};if(!c.variants.includes(name))c.variants.push(name);if(row.status==='registered')c.registered++;companies.set(key,c);}if((r.data?.length??0)<500)break;if(offset===20000)throw Error('企業一覧の件数上限を超えています');}
 return {companies:[...companies.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja')),portals:(portals.data??[]).map(p=>{let path:string|null=null;if(!p.revoked_at)try{path='/company/'+openPortalToken(p.token_ciphertext,process.env.SUPABASE_SERVICE_ROLE_KEY!);}catch{/* Rotating the URL recovers from an encryption-key rotation. */}return{id:p.id,key:p.company_key,name:p.display_name,createdAt:p.created_at,updatedAt:p.updated_at,revokedAt:p.revoked_at,path};})};
}
