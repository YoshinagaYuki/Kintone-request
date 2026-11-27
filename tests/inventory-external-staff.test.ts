import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveAdminStaff} from '../lib/inventory/admin-staff';
test('external names require an explicit mode while master IDs remain authoritative',()=>{
 const members=[{id:'one',name:'社内担当者'}];
 assert.deepEqual(resolveAdminStaff({staff_id:'one',staff_name:'偽の氏名'},members),{name:'社内担当者',external:false});
 assert.throws(()=>resolveAdminStaff({staff_name:'外部担当者'},members));
 assert.deepEqual(resolveAdminStaff({staff_mode:'external',staff_name:'  株式会社○○ 山田太郎  ',staff_id:'one'},members),{name:'株式会社○○ 山田太郎',external:true});
 for(const name of ['', ' ', 'x'.repeat(101),'name\nheader'])assert.throws(()=>resolveAdminStaff({staff_mode:'external',staff_name:name},members));
 assert.throws(()=>resolveAdminStaff({staff_mode:'unknown',staff_id:'one'},members));
});
