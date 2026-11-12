import {test} from 'node:test';import assert from 'node:assert/strict';
import {eventShippingDates,kitAllowsProduct} from '../lib/tezukuru-application';
test('event dates determine immutable shipping days across year and leap boundaries',()=>{
 assert.deepEqual(eventShippingDates('2026-12-31','2027-01-02'),{start:'2026-12-31',end:'2027-01-02',delivery:'2026-12-30',pickup:'2027-01-03'});
 assert.equal(eventShippingDates('2028-03-01','2028-03-01').delivery,'2028-02-29');
 assert.throws(()=>eventShippingDates('2026-02-30','2026-03-01'));
 assert.throws(()=>eventShippingDates('2026-12-02','2026-12-01'));
});
test('kit product choices use unions, explicit empty choices and unrestricted legacy defaults',()=>{
 const kits=[{id:'a',rental_product_ids:['p1']},{id:'b',rental_product_ids:['p2']},{id:'c',rental_product_ids:[]},{id:'legacy',rental_product_ids:null}];
 assert.equal(kitAllowsProduct('p1',kits,[]),false);
 assert.equal(kitAllowsProduct('p2',kits,['a']),false);
 assert.equal(kitAllowsProduct('p2',kits,['a','b']),true);
 assert.equal(kitAllowsProduct('p1',kits,['c']),false);
 assert.equal(kitAllowsProduct('p3',kits,['legacy']),true);
 assert.equal(kitAllowsProduct('p1',kits,['deleted']),false);
});
