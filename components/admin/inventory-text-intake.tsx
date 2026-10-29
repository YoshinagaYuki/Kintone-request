"use client";
import{useRef,useState}from'react';
import type{InventoryModel}from'@/lib/inventory/model';
import type{IntakeDraft}from'@/lib/inventory/text-intake';
import{InventoryHoldForm}from'./inventory-hold-form';
export function InventoryTextIntake({model,configured}:{model:InventoryModel;configured:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);const[text,setText]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState<IntakeDraft|null>(null),[version,setVersion]=useState(model.version),[confirmed,setConfirmed]=useState(false),[saved,setSaved]=useState(false);
 function close(){if(busy)return;dialog.current?.close();setKey('');}
 async function extract(){setBusy(true);setError('');try{const r=await fetch('/api/admin/inventory/text-intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,api_key:key,business:model.business??'allmight'})});const data=await r.json();if(!r.ok)throw Error(data.error);setDraft(data.draft);setVersion(data.version);setConfirmed(false);}catch(e){setError(e instanceof Error?e.message:'読み取れませんでした');}finally{setBusy(false);}}
 return <><button type="button" className="inventory-action inventory-action-intake border border-indigo-200 bg-white text-indigo-700" onClick={()=>{setSaved(false);dialog.current?.showModal();}}>文章から仮押さえ</button>
 <dialog ref={dialog} aria-labelledby="text-intake-title" className="inventory-list-dialog max-w-2xl" onCancel={e=>{if(busy)e.preventDefault();else setKey('');}}>
 <div className="inventory-list-header"><div className="flex items-center justify-between gap-3"><h2 id="text-intake-title" className="text-lg font-semibold">文章から仮押さえ</h2><button type="button" disabled={busy} className="inventory-close" onClick={close}>閉じる</button></div><p className="mt-2 text-xs leading-6 text-slate-500">{model.business==='tezukuru'?'てずくーる':'オールマイト'}の案件を1件ずつ貼り付け。読み取りだけでは在庫は確保されません。</p></div>
 <div className="inventory-list-body space-y-4 bg-white">
 {saved?<div role="status" className="rounded-xl bg-emerald-50 p-5"><h3 className="font-semibold text-emerald-900">仮押さえを登録しました</h3><p className="mt-2 text-sm text-emerald-800">在庫表と仮押さえ一覧に反映されます。</p><button type="button" className="mt-4 rounded-lg border bg-white px-4 py-3 text-sm" onClick={()=>{setSaved(false);setDraft(null);setText('');setConfirmed(false);}}>別の文章を読み取る</button></div>:!draft?<>
 <label className="block text-sm font-medium">営業メッセージ<textarea aria-label="営業メッセージ" value={text} onChange={e=>setText(e.target.value)} maxLength={6000} rows={9} placeholder={'例：担当 林田日香\n11/12〜11/15 利用\nauショップ〇〇\nスティックキャッチ大 2台'} className="mt-2 w-full rounded-xl border bg-slate-50 p-3 text-base font-normal leading-7"/></label><p className="text-right text-xs text-slate-400">{text.length} / 6,000文字</p>
 {!configured&&<details className="rounded-xl border p-3" open={!key}><summary className="cursor-pointer text-sm font-medium">Gemini APIの設定</summary><label className="mt-3 block text-xs">課金設定済みのAPIキー<input type="password" aria-label="Gemini APIキー" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} className="mt-2 w-full rounded-lg border p-3 text-base"/></label><p className="mt-2 text-xs leading-6 text-slate-500">この画面内だけで保持し、閉じると消去します。キーは読み取りのため当サイトのサーバーからGoogleへ送信します。</p></details>}
 <p className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">文章と機器・担当者のマスタ候補をGoogle Geminiへ送信します。電話番号・メールは送信前に除きます。住所や不要な個人情報は貼り付け前に削除してください。</p>
 {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<button type="button" disabled={busy||!text.trim()||(!configured&&!key.trim())} className="min-h-12 w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-50" onClick={extract}>{busy?'内容を読み取っています…':'内容を読み取る'}</button></>:<>
 <button type="button" className="min-h-11 text-sm text-indigo-700 underline" onClick={()=>{setDraft(null);setConfirmed(false);}}>← 原文に戻って読み直す</button>
 <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm">貼り付けた原文</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{text}</p></details>
 {!!draft.evidence.length&&<div className="rounded-xl bg-slate-50 p-3 text-xs leading-6"><p className="font-medium">読み取った箇所</p>{draft.evidence.map((s,i)=><p key={i} className="break-words">「{s}」</p>)}</div>}
 {!!draft.warnings.length&&<div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">確認が必要な内容</p><ul className="mt-2 list-disc space-y-2 pl-5">{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
 <p className="text-sm leading-7 text-slate-600">下の項目はすべて修正できます。納品・集荷が不要な場合は該当の日付を空欄にしてください。背景スクリーンは必要枚数を指定してください。</p>
 <label className="flex min-h-12 items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>原文と読み取り結果を確認しました。不明な内容は確認し、下の入力欄を修正して登録します。</label>
 {confirmed&&<InventoryHoldForm items={model.items} staff={model.staff} version={version} initialDraft={{...draft,note:`[文章から仮押さえ]\n${text.slice(0,1100)}\n[読み取り時の確認]\n${draft.warnings.join(' / ').slice(0,400)}`}} onSaved={()=>{setSaved(true);setDraft(null);setText('');}}/>}
 </>}
 </div></dialog></>;
}
