import type {KintoneRecord} from './kintone/mapper';
export const DELIVERY_FEE_KEY='_approved_delivery_fee';
export const RENTAL_FEE_KEY='_internal_rental_fee';
export function parseFee(value:unknown,label:string){if(value===''||value===null)return null;if(typeof value!=='string'&&typeof value!=='number')throw Error(`${label}は0以上の整数で入力してください`);const text=String(value).trim();if(!/^\d{1,9}$/.test(text))throw Error(`${label}は0〜999999999円の整数で入力してください`);return String(Number(text));}
export function approvalFees(data:Record<string,unknown>,body:Record<string,unknown>){const result={...data};for(const [field,key,label]of [['delivery_fee',DELIVERY_FEE_KEY,'配送費'],['rental_fee',RENTAL_FEE_KEY,'レンタル費用']]as const)if(body[field]!==undefined){const fee=parseFee(body[field],label);if(fee===null)delete result[key];else result[key]=fee;}return result;}
/** Explicit field allowlist: internal rental cost must never be sent to kintone. */
export function applyApprovalFees(record:KintoneRecord,data:Record<string,unknown>){if(data[DELIVERY_FEE_KEY]!=null)record['配送費']={value:parseFee(data[DELIVERY_FEE_KEY],'配送費')??''};}
