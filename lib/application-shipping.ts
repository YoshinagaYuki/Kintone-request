import {addDays,validDate} from './inventory/gantt';
import {parseFmt} from './parser/fmt-parser';
import {rewriteInventoryFmt} from './inventory/request-change';
import type {ParserConfig} from '@/types/request';

export const SHIPPING_DATE_REQUEST_NOTE='配送日・集荷日は利用開始日の前日・利用最終日の翌日に自動設定され、この画面では変更できません。別日をご希望の場合は、画面一番下の「お客様からの要望」に希望日と理由をご記入ください。ご記入いただいても、ご希望の日程での配送・集荷をお約束するものではありません。';
export function automaticShippingDay(date:string,offset:-1|1){return validDate(date)?addDays(date,offset):'';}
/** Structured public Allmight applications derive dates on the server as well as the UI. */
export function applyUsageShippingDates(raw:string,config:ParserConfig){
 const parsed=parseFmt(raw,{...config,required_labels:[]});
 if(!parsed.ok)throw Error(parsed.errors.join(' / '));
 const start=parsed.data['利用開始日'],end=parsed.data['利用最終日'];
 if(!validDate(start)||!validDate(end)||start>end||start<'2000-01-02'||end>'2100-12-30')throw Error('利用開始日・利用最終日を正しく選択してください。');
 return rewriteInventoryFmt(raw,{'配送日付':automaticShippingDay(start,-1),'集荷日付':automaticShippingDay(end,1)});
}
