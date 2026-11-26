import {StatusBadge} from './status-badge';
import type {RequestStatus} from '@/types/request';
import type {ReviewState} from '@/lib/staff-review/model';
export function RequestProgressBadge({status,review}:{status:RequestStatus;review?:ReviewState}){
 if(status!=='pending')return <StatusBadge status={status}/>;
 const returned=review==='returned',staff=review==='pending';
 return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${returned?'border-rose-200 bg-rose-50 text-rose-800':staff?'border-amber-200 bg-amber-50 text-amber-900':'border-indigo-200 bg-indigo-50 text-indigo-800'}`}><span className={`h-1.5 w-1.5 rounded-full ${returned?'bg-rose-500':staff?'bg-amber-500':'bg-indigo-500'}`}/>{returned?'申請者の修正待ち':staff?'担当者の確認待ち':'管理者の確認待ち'}</span>;
}
