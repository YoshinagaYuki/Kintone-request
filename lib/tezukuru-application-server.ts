import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {kitAllowsProduct} from './tezukuru-application';
import {contentLabel,MAX_PRODUCTS} from './tezukuru-fmt';
export async function assertKitProducts(db:SupabaseClient,parsed:Record<string,unknown>,selectedIds:string[]){
 const [kits,products]=await Promise.all([db.from('item_name_master').select('id,rental_product_ids').eq('category','tezukuru').eq('inventory_role','rental_kit').eq('is_active',true),db.from('item_name_master').select('id,name,excluded_slots').eq('category','tezukuru').is('inventory_role',null).eq('is_active',true)]);
 if(kits.error||products.error)throw Error('商品とレンタル品のマスタを確認できません');
 for(let slot=1;slot<=MAX_PRODUCTS;slot++){const name=String(parsed[contentLabel(slot)]??'').trim();if(!name)continue;const product=products.data?.find(p=>p.name===name);if(!product||!kitAllowsProduct(product.id,kits.data??[],selectedIds)||(product.excluded_slots??[]).includes(slot))throw Error(`商品${slot}「${name}」は選択したレンタル品では取り扱いがありません。商品を選び直してください`);}
}
