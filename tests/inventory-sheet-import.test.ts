import {test} from 'node:test';import assert from 'node:assert/strict';
import {importedBookings,type ImportedEntry} from '../lib/inventory/sheet-import';
const entry:ImportedEntry={source_key:'a',source_tab:'JET Cola',source_cell:'D36',staff_name:'要確認',store_name:'ベル１G',management_no:'',start_date:'2026-11-01',end_date:'2026-11-06',request_id:null,item_id:'jet',state:'hold'};
test('import retains source text and dates without inventing a staff member',()=>{const [b]=importedBookings([entry]);assert.equal(b.staff,'要確認');assert.equal(b.end,'2026-11-06');assert.equal(b.kind,'imported');assert.equal(b.source,'JET Cola D36');});
test('linked and skipped numbers never create duplicate occupancy',()=>{assert.deepEqual(importedBookings([{...entry,state:'linked',request_id:'r'},{...entry,state:'skipped'}]),[]);});
test('return blocks retain occupancy without turning into applications',()=>{const [b]=importedBookings([{...entry,state:'blocked'}]);assert.equal(b.status,'blocked');assert.equal(b.kind,'imported');});
