import {notFound} from 'next/navigation';
import {CompanyRentalSummary} from '@/components/company-portal/company-rental-summary';
import {publicPortalReport} from '@/lib/company-portal/server';
import {monthBounds} from '@/lib/company-portal/report';
export const dynamic='force-dynamic';
export const metadata={title:'レンタルご利用一覧',robots:{index:false,follow:false}};
export default async function CompanyPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{month?:string}>}){const {token}=await params,query=await searchParams,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());let month=query.month||today.slice(0,7);try{monthBounds(month);}catch{month=today.slice(0,7);}const report=await publicPortalReport(token,month);if(!report)notFound();return <CompanyRentalSummary key={month} token={token} report={report} month={month} today={today}/>;}
