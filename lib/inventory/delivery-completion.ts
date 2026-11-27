import type { InventoryBusiness } from './business';
import type { DeliveryRow } from './deliveries';
import { validDate } from './gantt';

export type DeliveryCompletion = { key: string; completed: boolean; completedAt: string | null; source?:string;autoDisabled?:boolean;checkedAt?:string|null;autoStatus?:string|null;updatedAt?:string };
export function mergeDeliveryCompletions(previous:Record<string,DeliveryCompletion>,incoming:DeliveryCompletion[]){const next={...previous};for(const row of incoming){if(!next[row.key]?.updatedAt||!row.updatedAt||row.updatedAt>=next[row.key].updatedAt!)next[row.key]=row;}return next;}
export function deliveryBusiness(value: unknown): InventoryBusiness {
  if (value !== 'allmight' && value !== 'tezukuru') throw Error('事業を選択してください。');
  return value;
}
export function completionInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('入力内容が不正です。');
  const input = value as Record<string, unknown>;
  const business = deliveryBusiness(input.business);
  if (typeof input.key !== 'string' || !input.key || input.key.length > 10000 || typeof input.completed !== 'boolean') throw Error('配送完了の入力内容が不正です。');
  if(input.automatic!==undefined&&typeof input.automatic!=='boolean')throw Error('自動確認の指定が不正です。');
  return { business, key: input.key, completed: input.completed,...(input.automatic!==undefined?{automatic:input.automatic as boolean}:{}) };
}
export function completionRange(from: unknown, to: unknown) {
  if (!validDate(from) || !validDate(to) || from < '2000-01-01' || to > '2100-12-31' || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 31) throw Error('確認する期間が不正です。');
  return { from, to };
}
/** Resolve against the edited server model: never trust browser dates or case details. */
export function completionDelivery(rows: DeliveryRow[], key: string) {
  const row = rows.find(row => row.key === key);
  if (!row) throw Error('納品予定が変更されています。ページを再読み込みして確認してください。');
  return row;
}
