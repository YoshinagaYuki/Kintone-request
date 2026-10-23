import { canManageInventoryRequest } from "../request-access";
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVersionedConfig } from "@/lib/form-types";
import { findRecords, getRecord, registerRecord, updateRecord, KintoneApiError } from "@/lib/kintone/client";
import { issueManagementNumber } from "@/lib/kintone/numbering";
import { normalizeRecordItems } from "@/lib/item-normalizer";
import type { FieldMapping } from "@/lib/kintone/mapper";
import { executeExtension, type Progress } from "./flow";
import { extensionDraft } from "./model";
export const extensionsEnabled = () => process.env.INVENTORY_EXTENSIONS_ENABLED === "true";
export async function runInventoryExtension(childId: string, actor: string) {
  if (!extensionsEnabled()) return { ok: false as const, error: "延長連携は停止中です。通常の新規登録は行いません" };
  const db = createAdminClient();
  if(!await canManageInventoryRequest(db,childId,actor))return {ok:false as const,error:"この事業の担当権限が必要です"};
  const token = crypto.randomUUID();
  const claim = await db.rpc("claim_inventory_extension", { p_id: childId, p_token: token, p_actor: actor });
  if (claim.error || !claim.data) return { ok: false as const, error: "延長の処理状態を確認できませんでした" };
  if (claim.data.busy) return { ok: false as const, error: "延長の連携処理中です。しばらくして再読み込みしてください" };
  const job = claim.data.job as { id: string; parent_request_id: string; child_request_id: string; pickup_date: string; progress: Progress };
  if (claim.data.complete) {
    const { data } = await db.from("requests").select("kintone_record_id,management_no").eq("id", childId).single();
    return data ? { ok: true as const, recordId: data.kintone_record_id as string, managementNo: data.management_no as string } : { ok: false as const, error: "完了した延長の申請を取得できませんでした" };
  }
  try {
    const [child, parent] = await Promise.all([
      db.from("requests").select("parsed_data,form_type_id,form_type_version,approved_staff_name,dsp_handover_note,form_types(field_mapping)").eq("id",childId).single(),
      db.from("requests").select("parsed_data,kintone_record_id,management_no").eq("id",job.parent_request_id).single(),
    ]);
    if (child.error || parent.error || !child.data || !parent.data) throw new Error("延長元または新申請を取得できませんでした");
    const c = child.data, p = parent.data;
    const version = await getVersionedConfig(db,c.form_type_id,c.form_type_version);
    const mapping = version?.field_mapping ?? (c.form_types as unknown as {field_mapping:FieldMapping})?.field_mapping;
    if (!mapping?.mappings?.length) throw new Error("申請時点のkintoneマッピングが未設定です");
    const parsed = { ...c.parsed_data } as Record<string,string>;
    if (c.approved_staff_name) parsed["担当者"] = c.approved_staff_name;
    const draft = extensionDraft(parsed,mapping,childId,p.management_no);
    await normalizeRecordItems(db,"オールマイト",draft);
    const result = await executeExtension({ childId, parentRecordId:p.kintone_record_id, parentNumber:p.management_no, parentUsageEnd:p.parsed_data["利用最終日"], parentPickupDate:p.parsed_data["集荷日付"] ?? "", pickupDate:job.pickup_date, draft, progress:job.progress },{
      async checkpoint(progress) {
        const { data, error } = await db.from("inventory_extensions").update({progress}).eq("id",childId).eq("lease_token",token).select("id").maybeSingle();
        if (error || !data) throw new Error("延長処理の保存に失敗、または処理権限を失いました");
      },
      async find(app,key,value) {
        const escaped=value.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
        return findRecords(app,`${key} = "${escaped}" limit 2`);
      },
      async get(app,id) { return (await getRecord(app,id)).record; },
      async create(app,record) { return (await registerRecord(app,record)).recordId; },
      async update(app,id,fields,revision) { await updateRecord(app,id,fields,revision); },
      issueNumber:issueManagementNumber,
      async saveIdentity(recordId,managementNo) {
        const {data,error}=await db.from("requests").update({kintone_record_id:recordId,management_no:managementNo}).eq("id",childId).eq("processing_token",token).select("id").maybeSingle();
        if(error||!data) throw new Error("新管理番号の保存に失敗しました");
      },
      definitelyRejected:e=>e instanceof KintoneApiError && e.status>=400 && e.status<500,
    });
    const finish=await db.rpc("finish_inventory_extension",{p_id:childId,p_token:token,p_record_id:result.recordId,p_management_no:result.managementNo});
    if(finish.error) throw new Error("外部連携は完了しましたが完了状態を保存できませんでした。再実行で照合できます");
    return { ok:true as const, recordId:result.recordId, managementNo:result.managementNo };
  } catch(e) {
    const error=e instanceof Error?e.message:"延長連携に失敗しました";
    const {data:owned}=await db.from("inventory_extensions").update({state:"failed",last_error:error,lease_token:null,lease_at:null}).eq("id",childId).eq("lease_token",token).select("id").maybeSingle();
    if(owned) {
      await db.from("requests").update({status:"register_failed",processing_at:null,processing_token:null}).eq("id",childId).eq("processing_token",token);
      await db.from("request_histories").insert({request_id:childId,action:"kintone_failed",actor,detail:{kind:"extension",error}});
    }
    return {ok:false as const,error};
  }
}
