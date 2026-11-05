import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { inventoryAccess } from '@/lib/inventory/access';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadInventoryModel } from '@/lib/inventory/model';
import { deliveryRows } from '@/lib/inventory/deliveries';
import { completionDelivery, completionInput, completionRange, deliveryBusiness } from '@/lib/inventory/delivery-completion';
import type { InventoryBusiness } from '@/lib/inventory/business';

const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function allowed(adminId: string, business: InventoryBusiness) {
  const result = await createAdminClient().from('admin_user_businesses').select('form_types!inner(kintone_app_id)').eq('admin_user_id', adminId).eq('form_types.kintone_app_id', business === 'allmight' ? 10 : 49).limit(1);
  if (result.error) throw Error('担当事業の確認に失敗しました。');
  return !!result.data?.length;
}
export async function GET(req: NextRequest) {
  const access = await inventoryAccess();
  if ('error' in access) return response({ error: access.error }, access.status);
  let business, range;
  try {
    business = deliveryBusiness(req.nextUrl.searchParams.get('business'));
    range = completionRange(req.nextUrl.searchParams.get('from'), req.nextUrl.searchParams.get('to'));
  } catch (error) { return response({ error: (error as Error).message }, 400); }
  try {
    if (!await allowed(access.admin.id, business)) return response({ error: 'この事業を操作する権限がありません。' }, 403);
    const result = await createAdminClient().from('inventory_delivery_completions').select('delivery_key,completed,completed_at').eq('business', business).gte('delivery_date', range.from).lte('delivery_date', range.to);
    if (result.error) throw Error('配送完了の記録を取得できませんでした。');
    return response({ completions: (result.data ?? []).map(row => ({ key: row.delivery_key, completed: row.completed, completedAt: row.completed_at })) });
  } catch (error) { return response({ error: (error as Error).message }, 500); }
}
export async function PUT(req: NextRequest) {
  const access = await inventoryAccess();
  if ('error' in access) return response({ error: access.error }, access.status);
  let input;
  try { input = completionInput(await req.json()); }
  catch (error) { return response({ error: error instanceof SyntaxError ? '入力内容が不正です。' : (error as Error).message }, 400); }
  try {
    if (!await allowed(access.admin.id, input.business)) return response({ error: 'この事業を操作する権限がありません。' }, 403);
    const model = await loadInventoryModel(access.db, '', input.business);
    let row;
    try { row = completionDelivery(deliveryRows(model.records, model.items), input.key); }
    catch (error) { return response({ error: (error as Error).message }, 409); }
    // Separate progress table: no stock clock, spreadsheet push, request status or kintone writes.
    const result = await createAdminClient().from('inventory_delivery_completions').upsert({
      business: input.business,
      delivery_id: createHash('sha256').update(row.key).digest('hex'),
      delivery_key: row.key,
      delivery_date: row.date,
      completed: input.completed,
      updated_by: access.admin.auth_user_id,
    }, { onConflict: 'business,delivery_id' }).select('delivery_key,completed,completed_at').single();
    if (result.error || !result.data) throw Error('配送完了の保存結果を確認できませんでした。一覧を開き直して確認してください。');
    return response({ completion: { key: result.data.delivery_key, completed: result.data.completed, completedAt: result.data.completed_at } });
  } catch (error) { return response({ error: (error as Error).message }, 500); }
}
