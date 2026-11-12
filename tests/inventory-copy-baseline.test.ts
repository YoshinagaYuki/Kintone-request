import {test} from 'node:test';import assert from 'node:assert/strict';
import {copySourceBaseline} from '../lib/inventory/copy-baseline';
const source={related:[{itemId:'item',booking:{key:'source',unitNumber:3,end:'2026-11-30'}}] as any,parsed:{利用最終日:'2026-11-30'},snapshot:{usage_end:'2026-11-30'},formId:'form',version:1,parentKey:'number:1026',billingType:'',rentalPlanId:''};
test('unrelated inventory clock changes do not invalidate an unchanged copy source',()=>assert.equal(copySourceBaseline({...source,inventoryVersion:1} as any),copySourceBaseline({...source,inventoryVersion:2} as any)));
test('source dates, equipment, invoice data and configuration still invalidate stale copies',()=>{
 const baseline=copySourceBaseline(source);
 for(const changed of [{...source,parsed:{利用最終日:'2026-12-31'}},{...source,related:[{itemId:'item',booking:{...source.related[0].booking,unitNumber:6}}]},{...source,snapshot:{usage_end:'2026-12-31'}},{...source,version:2}])assert.notEqual(copySourceBaseline(changed),baseline);
});
