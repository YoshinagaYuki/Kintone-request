import {NextResponse} from 'next/server';
import {portalAdmin,portalRequests,PORTAL_HEADERS} from '@/lib/company-portal/server';
import {companyKey} from '@/lib/company-portal/company-name';
import {companyRows,monthBounds} from '@/lib/company-portal/report';
export async function GET(req:Request){if(!await portalAdmin())return NextResponse.json({error:'管理者権限が必要です'},{status:403});try{const u=new URL(req.url),company=u.searchParams.get('company')??'',month=u.searchParams.get('month')??'';if(company.length>200||!companyKey(company))throw Error('企業名を入力してください');monthBounds(month);return NextResponse.json({name:company,...companyRows(await portalRequests(companyKey(company)),companyKey(company),month)},{headers:PORTAL_HEADERS});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'一覧を確認できませんでした'},{status:400,headers:PORTAL_HEADERS});}}
