import type { KintoneRecord } from "@/lib/kintone/mapper";
import type { KintoneRawRecord } from "@/lib/kintone/client";
import { extensionShippingDraft } from "./model";
export type Progress = { recordAttempted?: boolean; recordId?: string; managementNo?: string; shippingAttempted?: boolean; shippingId?: string; oldPickupCancelled?: boolean; carrierCancellationRequired?: boolean };
export type ExtensionPlan = { childId: string; parentRecordId: string; cancelParentPickup?:boolean;pickupRequired?:boolean;deliveryRequired?:boolean; parentNumber: string; parentUsageEnd: string; parentPickupDate: string; pickupDate: string; draft: KintoneRecord; progress: Progress };
export interface ExtensionPorts {
  checkpoint(progress: Progress): Promise<void>;
  find(app: 10 | 11, key: string, value: string): Promise<KintoneRawRecord[]>;
  get(app: 10 | 11, id: string): Promise<KintoneRawRecord>;
  create(app: 10 | 11, record: KintoneRecord): Promise<string>;
  update(app: 10 | 11, id: string, fields: KintoneRecord, revision: string): Promise<void>;
  issueNumber(): Promise<string>;
  saveIdentity(recordId: string, managementNo: string): Promise<void>;
  definitelyRejected(error: unknown): boolean;
}
const value = (r: KintoneRawRecord, field: string) => String(r[field]?.value ?? "");
export async function executeExtension(plan: ExtensionPlan, ports: ExtensionPorts) {
  let progress = { ...plan.progress };
  const checkpoint = async (patch: Partial<Progress>) => { progress = { ...progress, ...patch }; await ports.checkpoint(progress); };
  const marker = `inventory-extension:${plan.childId}`;
  const findOne = async (app: 10 | 11, key: string, v: string) => {
    const rows = await ports.find(app, key, v);
    if (rows.length > 1) throw new Error("同じ連携キーのkintoneレコードが複数あります。内容確認が必要です");
    return rows[0] ? value(rows[0], "$id") : null;
  };
  const checkedUpdate = async (app: 10 | 11, id: string, key: string, expected: string, fields: KintoneRecord, sourceDates?: Record<string,string>) => {
    const r = await ports.get(app, id);
    if(sourceDates && Object.entries(sourceDates).some(([field,date])=>value(r,field)!==date)) throw new Error("元案件の日付が変更されています。内容を確認してください");
    if (value(r, key) !== expected) throw new Error("kintoneの管理番号または連携キーが一致しません");
    if (Object.entries(fields).every(([k, v]) => value(r, k) === v.value)) return;
    await ports.update(app, id, fields, value(r, "$revision"));
  };
  // Validate the source again at approval, before creating a new bill or issuing a number.
  if(plan.parentRecordId&&!progress.recordId){const source=await ports.get(10,plan.parentRecordId);if(value(source,'管理番号')!==plan.parentNumber||value(source,'日付_1')!==plan.parentUsageEnd||value(source,'集荷_日付')!==plan.parentPickupDate)throw Error('元案件の利用日・集荷日がkintone側で変更されています。内容を確認してください');}
  if (!progress.recordId) {
    const recovered = await findOne(10, "external_project_id", marker);
    if (recovered) await checkpoint({ recordId: recovered });
    else {
      if (progress.recordAttempted) throw new Error("新規登録の結果が不明です。重複防止のためkintone側の連携キーを確認してください");
      await checkpoint({ recordAttempted: true });
      let id: string;
      try { id = await ports.create(10, plan.draft); }
      catch (e) { if (ports.definitelyRejected(e)) await checkpoint({ recordAttempted: false }); throw e; }
      await checkpoint({ recordId: id });
    }
  }
  const recordId = progress.recordId!;
  const childRecord = await ports.get(10, recordId);
  if (value(childRecord, "external_project_id") !== marker) throw new Error("延長レコードの連携キーが一致しません");
  const remoteNumber = value(childRecord, "管理番号");
  if (remoteNumber && progress.managementNo && remoteNumber !== progress.managementNo) throw new Error("延長の管理番号が変更されています");
  const managementNo = remoteNumber || progress.managementNo || await ports.issueNumber();
  if (!/^\d+$/.test(managementNo) || managementNo === plan.parentNumber) throw new Error("新しい管理番号を取得できませんでした");
  await checkpoint({ managementNo });
  await ports.saveIdentity(recordId, managementNo);
  await checkedUpdate(10, recordId, "external_project_id", marker, { "管理番号": { value: managementNo } });
  if (!progress.shippingId) {
    const recovered = await findOne(11, "管理番号", managementNo);
    if (recovered) await checkpoint({ shippingId: recovered });
    else {
      if (progress.shippingAttempted) throw new Error("配送管理の登録結果が不明です。重複防止のため新管理番号で確認してください");
      await checkpoint({ shippingAttempted: true });
      let id: string;
      try { id = await ports.create(11, extensionShippingDraft(plan.draft, managementNo)); }
      catch (e) { if (ports.definitelyRejected(e)) await checkpoint({ shippingAttempted: false }); throw e; }
      await checkpoint({ shippingId: id });
    }
  }
  // 新旧の参照を確認してから旧集荷を切替。新レコードはこの時点では両方とも手配不要。
  if(plan.cancelParentPickup!==false){
  const parent = await ports.get(10, plan.parentRecordId);
  if (value(parent, "管理番号") !== plan.parentNumber || value(parent, "日付_1") !== plan.parentUsageEnd || value(parent, "集荷_日付") !== plan.parentPickupDate) throw new Error("元案件の利用日・集荷日がkintone側で変更されています。内容を確認してください");
  const parentShippingId = await findOne(11, "管理番号", plan.parentNumber);
  if (!parentShippingId) throw new Error("元案件の配送管理レコードが見つかりません");
  const parentShipping = await ports.get(11, parentShippingId);
  if (value(parentShipping, "集荷_日付") !== plan.parentPickupDate) throw new Error("元案件の配送管理で集荷日が変更されています");
  const carrierCancellationRequired = Boolean(value(parentShipping, "tracking_no_pickup")) || value(parentShipping, "ドロップダウン") === "集荷手配済み";
  await checkpoint({ carrierCancellationRequired });
  await checkedUpdate(10, plan.parentRecordId, "管理番号", plan.parentNumber, { "集荷_手配種別": { value: "手配不要" } }, {"日付_1":plan.parentUsageEnd,"集荷_日付":plan.parentPickupDate});
  await checkedUpdate(11, parentShippingId, "管理番号", plan.parentNumber, { "集荷_手配種別": { value: "手配不要" } }, {"集荷_日付":plan.parentPickupDate});
  await checkpoint({ oldPickupCancelled: true });
  }
  const pickup = { "集荷_手配種別": { value: plan.pickupRequired===false?"手配不要":"通常配送" }, "集荷_日付": { value: plan.pickupRequired===false?'':plan.pickupDate }, "手配種別": { value: plan.deliveryRequired?"通常配送":"手配不要" } };
  await checkedUpdate(10, recordId, "external_project_id", marker, pickup);
  await checkedUpdate(11, progress.shippingId!, "管理番号", managementNo, { ...pickup, "ドロップダウン_1": { value: "入力完了" } });
  return { recordId, managementNo, shippingId: progress.shippingId!, carrierCancellationRequired:progress.carrierCancellationRequired??false };
}
