import {createClient} from '@/lib/supabase/server';
export async function InventoryImportLinks({requestId}:{requestId:string}){
 const db=await createClient();const {data,error}=await db.from('inventory_sheet_entries').select('source_tab,source_cell,start_date,end_date').eq('request_id',requestId).eq('state','linked').order('start_date');
 if(error||!data?.length)return null;
 return <section className="rounded-lg border bg-white p-4"><h2 className="font-bold">旧在庫シートとの紐づけ</h2><p className="mt-1 text-sm text-slate-600">管理番号の一致を確認済みです。在庫表にはこの申請を1件として計上します。</p><ul className="mt-2 text-sm">{data.map(e=><li key={`${e.source_tab}:${e.source_cell}`}>{e.source_tab} {e.source_cell}：{e.start_date} 〜 {e.end_date}</li>)}</ul></section>;
}
