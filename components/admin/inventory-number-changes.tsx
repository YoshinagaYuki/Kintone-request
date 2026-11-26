import type {ConfirmationNumberChange} from '@/lib/inventory/confirmation-conflicts';
export function InventoryNumberChanges({value}:{value:unknown}){
 if(!Array.isArray(value))return null;
 const rows=value.filter((r):r is ConfirmationNumberChange=>r&&typeof r.item==='string'&&Number.isInteger(r.to)&&(r.from===null||Number.isInteger(r.from))&&typeof r.fromDate==='string'&&typeof r.toDate==='string');if(!rows.length)return null;
 return <section className="my-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><h2 className="text-sm font-bold text-indigo-950">空いている機器番号へ自動で振り替えました</h2><p className="mt-1 text-xs leading-6 text-indigo-900">輸送・返却・点検期間を確認して割り当てています。登録後の機器番号はこちらをご確認ください。</p><ul className="mt-3 space-y-2">{rows.map((r,i)=><li key={i} className="rounded-lg bg-white p-3 text-sm"><strong>{r.item}：{r.from===null?'未割当':`${r.from}号`} → {r.to}号</strong><p className="mt-1 text-xs text-slate-500">確保期間 {r.fromDate} 〜 {r.toDate}</p></li>)}</ul></section>;
}
