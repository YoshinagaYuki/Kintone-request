import {test} from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {ApproveActions} from '../components/admin/approve-actions';
import {CompanyRentalSummary} from '../components/company-portal/company-rental-summary';
import type {PortalRow} from '../lib/company-portal/report';
(globalThis as any).React=React;
const render=(element:React.ReactElement)=>renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{} as any},element));
test('approval exposes an editable company field before approval without requiring blank legacy company data',()=>{
 const html=render(React.createElement(ApproveActions,{requestId:'test',status:'pending',previewOk:true,defaultCompanyName:'株式会社ユニティ'}));assert.match(html,/aria-label="承認する企業名"/);assert.match(html,/value="株式会社ユニティ"/);assert.match(html,/企業別のご利用一覧へ紐付け/);
 const old=render(React.createElement(ApproveActions,{requestId:'test',status:'pending',previewOk:true}));assert.doesNotMatch(old,/aria-label="承認する企業名"/);
});
test('high volume defaults to 50 cases per page, while totals cover all matching cases and preview cannot download or issue URLs',()=>{
 const rows:PortalRow[]=Array.from({length:64},(_,i)=>({key:String(i),managementNo:String(900000+i),brand:'allmight',start:'2026-11-21',end:'2026-11-21',delivery:'2026-11-20',pickup:'2026-11-22',place:`会場${i}`,address:'東京都',items:[{name:'JET Cola',quantity:1}],materials:[],rentalFee:10000,deliveryFee:2000}));
 const html=render(React.createElement(CompanyRentalSummary,{preview:true,report:{name:'サンプル',rows,undated:0},month:'2026-11',today:'2026-11-17'}));assert.match(html,/64/);assert.match(html,/管理番号900049の詳細/);assert.doesNotMatch(html,/管理番号900050の詳細/);assert.match(html,/CSVは絞り込み結果を全件出力/);assert.doesNotMatch(html,/\/api\/company\//);assert.doesNotMatch(html,/undefined\?month/);
});
