import {test} from 'node:test';import assert from 'node:assert/strict';
import {automaticShippingDay,applyUsageShippingDates} from '../lib/application-shipping';
import {parseFmt} from '../lib/parser/fmt-parser';
test('public Allmight server overwrites missing or manipulated shipping dates from a one-day, month/year boundary or leap day rental',()=>{
 for(const [start,end,delivery,pickup] of [['2026-11-21','2026-11-22','2026-11-20','2026-11-23'],['2026-12-31','2026-12-31','2026-12-30','2027-01-01'],['2028-03-01','2028-03-01','2028-02-29','2028-03-02']]){
  const raw=`利用開始日: ${start}\n利用最終日: ${end}\n配送日付: 2099-01-01\n集荷日付: 2099-01-01`;
  const result=parseFmt(applyUsageShippingDates(raw,{}),{required_labels:['配送日付','集荷日付']});if(!result.ok)throw Error(result.errors.join('/'));assert.equal(result.data['配送日付'],delivery);assert.equal(result.data['集荷日付'],pickup);
 }
 assert.equal(automaticShippingDay('',-1),'');assert.equal(automaticShippingDay('2026-02-30',1),'');
 for(const raw of ['利用開始日: 2026-11-22\n利用最終日: 2026-11-21','利用開始日: 2026-11-21'])assert.throws(()=>applyUsageShippingDates(raw,{}),/利用開始日/);
});
