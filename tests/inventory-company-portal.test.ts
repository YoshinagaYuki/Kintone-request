import {test} from 'node:test';import assert from 'node:assert/strict';
import {companyKey,approvedCompanyName} from '../lib/company-portal/company-name';
import {companyRows,filterPortalRows,portalTotals,portalCsv,portalRow,monthBounds,type CompanyRequest} from '../lib/company-portal/report';
import {issuePortalToken,openPortalToken,portalTokenHash,validPortalToken} from '../lib/company-portal/token';
const request=(id:string,company='株式会社ユニティ'):CompanyRequest=>({id,company_name:company,management_no:id,form_types:{kintone_app_id:10},parsed_data:{'企業名':company,'利用開始日':'2026-11-21','利用最終日':'2026-11-21','配送日付':'2026-11-20','集荷日付':'2026-11-22','イベントブース名':'新宿店','配送住所':'東京都新宿区','機器商品①':'JET Cola','機器商品②':'JET Cola',_internal_rental_fee:'10000',_approved_delivery_fee:'2000','申請者メールアドレス':'private@example.com','補足':'社内情報'}});
test('company matching accepts only the requested legal form variations and approved Unity alias',()=>{
 for(const n of ['株式会社ユニティ','ユニティ','Unity','ユニティ株式会社','（株）ユニティ','㈱ ユニティ',' ＵＮＩＴＹ '])assert.equal(companyKey(n),'ユニティ',n);
 for(const n of ['ユニティサービス','ユニティ東京支店','有限会社ユニティ','Unity2'])assert.notEqual(companyKey(n),'ユニティ');assert.equal(companyKey('株式会社ABC'),'abc');
});
test('approval company correction writes both current and legacy labels without mutating source or fee metadata',()=>{
 const source={'企業名':'旧企業','取次店名':'旧企業',_internal_rental_fee:'1000'};const next=approvedCompanyName(source,' 株式会社ユニティ ');assert.equal(next['企業名'],'株式会社ユニティ');assert.equal(next['取次店名'],'株式会社ユニティ');assert.equal(next._internal_rental_fee,'1000');assert.equal(source['企業名'],'旧企業');assert.equal(approvedCompanyName(source,undefined),source);assert.throws(()=>approvedCompanyName(source,3));assert.throws(()=>approvedCompanyName(source,'A\nB'));assert.equal(approvedCompanyName(source,'')['企業名'],'');
});
test('20 cases on the same day stay separate, equipment quantities group, fees are counted once per case',()=>{
 const rows=companyRows(Array.from({length:20},(_,i)=>request(String(i+1))),'ユニティ','2026-11').rows;assert.equal(rows.length,20);assert.equal(rows[0].items[0].quantity,2);assert.deepEqual(portalTotals(rows),{cases:20,units:40,priced:20,unpriced:0,amount:240000});
});
test('month overlap, year boundary, one-day use, other company separation, and undated counts',()=>{
 const r=request('cross');r.parsed_data!['利用開始日']='2026-12-30';r.parsed_data!['利用最終日']='2027-01-02';
 const undated=request('blank');undated.parsed_data!['利用開始日']='';
 const other=request('secret','別企業');const one=request('one');
 assert.equal(companyRows([r,undated,other,one],'ユニティ','2026-11').rows.length,1);
 assert.equal(companyRows([r,other],'ユニティ','2027-01').rows.length,1);assert.equal(companyRows([r],'ユニティ','2027-02').rows.length,0);assert.equal(companyRows([undated,other],'ユニティ','2026-11').undated,1);assert.throws(()=>monthBounds('2026-13'));assert.throws(()=>monthBounds('bad'));
});
test('blank amounts stay unknown, explicit zero is free, partially registered cases are excluded from total',()=>{
 const r=request('blank');delete r.parsed_data!._internal_rental_fee;const row=portalRow(r)!;assert.equal(row.rentalFee,null);assert.equal(portalTotals([row]).amount,0);assert.equal(portalTotals([row]).unpriced,1);r.parsed_data!._internal_rental_fee='0';r.parsed_data!._approved_delivery_fee='0';assert.equal(portalTotals([portalRow(r)!]).priced,1);assert.equal(portalTotals([portalRow(r)!]).amount,0);
});
test('Tezukuru physical kits, materials and confirmed product names remain distinct',()=>{
 const r=request('tezu');r.form_types={kintone_app_id:49};r.parsed_data={_inventory_usage_start:'2026-11-21',_inventory_usage_end:'2026-11-21',_inventory_kit_names:['シールLAB','シールLAB'],'コンテンツ1':'旧名称','数量1':'200'};r.approved_contents={'コンテンツ1':'正式な教材名'};const row=portalRow(r)!;assert.equal(row.items[0].quantity,2);assert.deepEqual(row.materials,[{name:'正式な教材名',quantity:200}]);assert.equal(row.brand,'tezukuru');
});
test('public rows allowlist only customer fields; CSV shares filtering and prevents formula injection',()=>{
 const r=request('23');r.parsed_data!['イベントブース名']='=HYPERLINK("bad")';const row=portalRow(r)!;const body=JSON.stringify(row);assert.doesNotMatch(body,/private@example|社内情報|parsed_data/);const csv=portalCsv('株式会社ユニティ','2026-11',filterPortalRows([row],'23','allmight'));assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/'=HYPERLINK/);assert.equal(csv.split('\r\n').length,3);assert.match(csv,/10000.*2000.*12000/);assert.equal(filterPortalRows([row],'別店舗').length,0);assert.equal(filterPortalRows([row],'','tezukuru').length,0);
});
test('portal URLs use independent 256-bit tokens with authenticated encryption and hash-only lookup',()=>{
 const a=issuePortalToken('test-secret'),b=issuePortalToken('test-secret');assert.equal(validPortalToken(a.token),true);assert.notEqual(a.token,b.token);assert.equal(openPortalToken(a.encrypted,'test-secret'),a.token);assert.equal(portalTokenHash(a.token),a.hash);assert.equal(a.hash.length,64);assert.ok(!a.encrypted.includes(a.token));assert.throws(()=>openPortalToken(a.encrypted,'wrong-secret'));assert.equal(validPortalToken('ユニティ'),false);
});

import {samePortalOrigin} from '../lib/company-portal/origin';
test('URL management permits its public proxy origin and rejects foreign origins',()=>{
 assert.equal(samePortalOrigin(new Request('http://localhost:4128/api',{headers:{host:'127.0.0.1:4128',origin:'http://127.0.0.1:4128'}})),true);
 assert.equal(samePortalOrigin(new Request('http://localhost/api',{headers:{'x-forwarded-host':'kintone-request.vercel.app','x-forwarded-proto':'https',origin:'https://kintone-request.vercel.app'}})),true);
 assert.equal(samePortalOrigin(new Request('https://kintone-request.vercel.app/api',{headers:{host:'kintone-request.vercel.app',origin:'https://foreign.example'}})),false);
 assert.equal(samePortalOrigin(new Request('https://kintone-request.vercel.app/api',{headers:{host:'kintone-request.vercel.app',origin:'null'}})),false);
});
