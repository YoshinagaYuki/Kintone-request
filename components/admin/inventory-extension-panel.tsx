import Link from "next/link";
import { InventoryExtensionRetry } from "./inventory-extension-retry";
import { createClient } from "@/lib/supabase/server";
import { extensionsEnabled } from "@/lib/inventory/extensions/runner";
import { addDays, validDate } from "@/lib/inventory/gantt";
import { InventoryExtensionForm } from "./inventory-extension-form";
export async function InventoryExtensionPanel({request,canManage}:{request:{id:string;status:string;parsed_data:Record<string,string>;management_no:string|null;deleted_at:string|null;processing_at:string|null;inventory_parent_request_id?:string|null};canManage:boolean}) {
  if(!extensionsEnabled())return null;
  const db=await createClient();
  const {data,error}=await db.from("inventory_extensions").select("id,parent_request_id,child_request_id,state,last_error,progress").or(`parent_request_id.eq.${request.id},child_request_id.eq.${request.id}`);
  if(error)return <p role="alert" className="my-4 text-red-700">延長の状態を取得できませんでした。</p>;
  const incoming=data?.find(e=>e.child_request_id===request.id),outgoing=data?.find(e=>e.parent_request_id===request.id);
  const end=request.parsed_data["利用最終日"];
  return <section id="inventory-extension" className="my-6"><h2 className="text-lg font-bold">延長・集荷の引継ぎ</h2>
    {incoming&&<div className="mt-2 rounded border border-purple-200 bg-purple-50 p-3 text-sm"><Link className="text-purple-800 underline" href={`/admin/requests/${incoming.parent_request_id}`}>延長元の申請を開く</Link><p>新規納品は不要です。配送・集荷先情報は空欄のため、必要な手配内容はkintoneで確認してください。</p>
      <p>{incoming.state==="complete"?"旧集荷の手配不要・新集荷日の登録まで完了しました。":"延長の外部連携が未完了です。完了するまで旧集荷の取消状況と新集荷の状態を確認してください。"}</p>
      {incoming.state!=="complete"&&canManage&&<InventoryExtensionRetry requestId={request.id}/>}
      {incoming.last_error&&<p role="alert" className="mt-2 font-medium text-red-700">{incoming.last_error}（下の再実行ボタンから、保存済みの段階を照合して再開できます）</p>}
      {(incoming.progress as {carrierCancellationRequired?:boolean})?.carrierCancellationRequired&&<p className="mt-2 font-bold text-amber-900">旧案件に集荷手配済みの情報があります。運送会社への旧集荷取消を確認してください。</p>}
    </div>}
    {outgoing?<p className="mt-2 rounded bg-purple-50 p-3"><Link className="text-purple-800 underline" href={`/admin/requests/${outgoing.child_request_id}`}>延長先の申請を開く</Link>（{outgoing.state==="complete"?"登録完了":"連携状況を確認"}）</p>:canManage&&request.status==="registered"&&!request.deleted_at&&!request.processing_at&&validDate(end)&&<InventoryExtensionForm requestId={request.id} currentEnd={end} nextDay={addDays(end,1)} currentNumber={request.management_no}/>}
    {(incoming||outgoing)&&<p className="mt-2 text-xs text-gray-600">延長に紐づく申請は、日付・商品・手配の通常編集や削除を停止しています。続けて延長する場合は最新の延長先から登録してください。</p>}
  </section>;
}
