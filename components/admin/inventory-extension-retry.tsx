"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function InventoryExtensionRetry({requestId}:{requestId:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState("");
 return <div className="my-3"><button className="rounded bg-purple-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const r=await fetch(`/api/admin/requests/${requestId}/extension-retry`,{method:"POST"});const b=await r.json();if(!r.ok)throw new Error(b.error||"延長を再実行できませんでした");router.refresh();}catch(e){setError(e instanceof Error?e.message:"通信に失敗しました");}finally{setBusy(false);}}}>{busy?"延長の連携状態を照合中…":"延長連携を再実行"}</button>{error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}<p className="mt-2 text-xs">別の処理が進行中の場合は再実行しません。異常終了の場合は開始から5分後に保存済みの段階から再開できます。</p></div>;
}
