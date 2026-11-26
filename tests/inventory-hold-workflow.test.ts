import {test} from 'node:test';
import {boardColor,boardStroke,BOARD_COLORS} from '../lib/inventory/presentation';
import assert from 'node:assert/strict';
import {holdWorkflow,withHoldWorkflows,isHoldPhase,shippingInformationEntered,holdWorkflowKeys} from '../lib/inventory/hold-workflow';
import {holdCases,filterHoldCases} from '../lib/inventory/hold-list';
import type {InventoryRecord} from '../lib/inventory/model';
const record=(key='one'):InventoryRecord=>({itemId:'item',booking:{key,id:key,group:key,bundleKey:'case',kind:'hold',status:'hold',managementNo:'',staff:'担当',store:'店舗',start:'2026-11-01',end:'2026-11-03',from:'2026-10-31',to:'2026-11-04',delivery:'2026-10-31',pickup:'2026-11-04',href:'',holdCreatedAt:'2026-11-01T23:15:00+09:00'}});
test('14 full days after registration, including JST midnight boundary; usage dates do not determine expiry',()=>{
 const r=record();const due=Date.parse('2026-11-15T23:15:00+09:00');assert.equal(holdWorkflow([r.booking],due-1).overdue,false);assert.equal(holdWorkflow([r.booking],due).overdue,true);
 r.booking.start='2027-01-01';r.booking.end='2027-02-01';assert.equal(holdWorkflow([r.booking],due).due,due);
});
test('waiting shipping, entered shipping and formally registered are all excluded from cancellation alerts',()=>{
 const now=Date.parse('2027-01-01');for(const phase of ['waiting_shipping','shipping_entered'] as const){const r=record();r.booking.holdPhase=phase;assert.equal(holdWorkflow([r.booking],now).overdue,false);}
 const r=record();r.booking.status='registered';assert.equal(holdWorkflow([r.booking],now).overdue,false);
});
test('memo/date/status saves preserve original registration time and all equipment shares oldest case age',()=>{
 const a=record(),b=record('two');b.booking.holdCreatedAt='2026-11-14T00:00:00Z';
 const saved=withHoldWorkflows([a,b],[{booking_key:'one',deleted:false,patch:{memo:'追記',start:'2026-12-01',holdPhase:'shipping_entered',holdWorkflowUpdatedAt:'2026-11-14T00:00:00Z'}}]);
 assert.equal(saved[0].booking.holdCreatedAt,a.booking.holdCreatedAt);assert.equal(holdWorkflow(saved.map(r=>r.booking)).opened,Date.parse(a.booking.holdCreatedAt!));assert.equal(holdWorkflow(saved.map(r=>r.booking)).label,'配送情報入力済み');
});
test('unknown legacy registration dates never invent overdue alerts; malformed phases cannot hide a valid alert',()=>{
 const r=record();delete r.booking.holdCreatedAt;assert.equal(holdWorkflow([r.booking]).overdue,false);assert.equal(holdWorkflow([r.booking]).due,null);
 assert.equal(isHoldPhase('toString'),false);assert.equal(isHoldPhase('shipping_entered'),true);
 const saved=withHoldWorkflows([record()],[{booking_key:'one',deleted:false,patch:{holdPhase:'invalid'}}]);assert.equal(holdWorkflow(saved.map(r=>r.booking),Date.parse('2026-12-01')).overdue,true);
});
test('overdue cases stay visible after rental end; search still applies; cancelled cases release all list entries',()=>{
 const rows=holdCases([record(),record('two')],[{id:'item',name:'商品'}]);const now=Date.parse('2026-12-01');
 assert.equal(filterHoldCases(rows,'','2026-12-01',false,now).length,1);assert.equal(filterHoldCases(rows,'店舗','2026-12-01',false,now).length,1);assert.equal(filterHoldCases(rows,'別の店','2026-12-01',false,now).length,0);
 assert.equal(holdCases([record(),record('two')].map(r=>({...r,deleted:true})),[]).length,0);
});

test('generated dates do not count as shipping information; both needed legs require address, contact and receiver',()=>{
 assert.equal(shippingInformationEntered({'配送日付':'2026-12-01','集荷日付':'2026-12-03'}),false);
 const delivery={'配送住所':'東京都千代田区…','当日受領者氏名':'担当','配送連絡先':'03-0000-0000'};
 assert.equal(shippingInformationEntered(delivery),false);assert.equal(shippingInformationEntered(delivery,true,false),true);
 assert.equal(shippingInformationEntered({...delivery,'集荷住所':'東京都…','当日引渡者氏名':'担当','集荷連絡先':'03-0000-0000'}),true);
});

test('case cancellation includes every monthly source piece so a later month cannot revive',()=>{const r=record();r.booking.monthlySourceKeys=['one','month-two','month-three'];assert.deepEqual(holdWorkflowKeys([r,record('two')]),['one','month-two','month-three','two']);});

test('unified registration saves use the latest case phase for every item, overriding initialization metadata',()=>{
 const a=record(),b=record('two');const result=withHoldWorkflows([a,b],[{booking_key:'one',deleted:false,patch:{holdPhase:'waiting_shipping'}},{booking_key:'two',deleted:false,patch:{holdPhase:'shipping_entered',holdPhaseVersion:100,bundleCommon:{holdPhase:'shipping_entered',holdPhaseVersion:100}}}]);
 assert.deepEqual(result.map(r=>r.booking.holdPhase),['shipping_entered','shipping_entered']);assert.equal(result[0].booking.holdCreatedAt,a.booking.holdCreatedAt);
 const reverted=withHoldWorkflows([a,b],[{booking_key:'one',deleted:false,patch:{holdPhase:'hold',holdPhaseVersion:101}},{booking_key:'two',deleted:false,patch:{holdPhase:'shipping_entered',holdPhaseVersion:100}}]);assert.deepEqual(reverted.map(r=>r.booking.holdPhase),['hold','hold']);
});

test('board colors distinguish provisional, waiting and entered while preserving delivery and confirmed colors',()=>{
 const a=record().booking;a.start='2026-12-02';a.end='2026-12-03';a.delivery='2026-12-01';a.pickup='2026-12-04';a.from=a.delivery;a.to=a.pickup;
 const waiting={...a,holdPhase:'waiting_shipping' as const},entered={...a,holdPhase:'shipping_entered' as const};
 assert.equal(new Set([boardColor(a,a.start),boardColor(waiting,a.start),boardColor(entered,a.start)]).size,3);assert.notEqual(boardStroke(waiting,a.start),boardStroke(entered,a.start));assert.equal(boardColor(entered,a.delivery),BOARD_COLORS.transit);assert.equal(boardColor({...entered,status:'registered'},a.start),BOARD_COLORS.registered);
});
