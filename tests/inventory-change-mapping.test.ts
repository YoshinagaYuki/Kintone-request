import {test} from 'node:test';import assert from 'node:assert/strict';
import {mapInventoryChangedFields} from '../lib/inventory/change-mapping';
import {buildKintoneRecord,type FieldMappingEntry} from '../lib/kintone/mapper';
test('transport-only inventory edits have no ordinary fields and must not claim the mapping is unconfigured',()=>{
 const mapped=mapInventoryChangedFields({_inventory_transport:{deliveryArrangement:'normal'}},[]);
 assert.deepEqual(mapped,{ok:true,record:{}});
 assert.equal(buildKintoneRecord({},{mappings:[]}).ok,false);
});
test('inventory field changes still validate required values and map only selected fields',()=>{
 const mappings:FieldMappingEntry[]=[{fmt_label:'店舗',kintone_code:'store',kintone_type:'SINGLE_LINE_TEXT',required:true}];
 assert.equal(mapInventoryChangedFields({},mappings).ok,false);
 const mapped=mapInventoryChangedFields({'店舗':'テスト店','他の項目':'転記しない'},mappings);
 assert.equal(mapped.ok,true);if(mapped.ok)assert.deepEqual(mapped.record,{store:{value:'テスト店'}});
});
