import type{SupabaseClient}from'@supabase/supabase-js';
export async function assertCopySourceEditable(db:SupabaseClient,key:string){
 const r=await db.from('inventory_copy_requests').select('id').neq('state','cancelled').contains('slots',[{source_key:key}]).limit(1);if(r.error)throw Error('コピー先の状態を確認できませんでした');if(r.data?.length)throw Error('この予定にはコピー先の新規申請があります。元の内容を直す場合は先にコピー先を取り消してください');
}
