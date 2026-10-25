"use client";
import type {InventoryRecord} from '@/lib/inventory/model';
import {useState,useRef,useLayoutEffect,Fragment} from "react";
import {useRouter} from "next/navigation";
import {type BoardBooking,type BoardLane} from "@/lib/inventory/board";
import type {CapacityItem} from "@/lib/inventory/availability";
import {InventoryBookingLabel} from "./inventory-booking-label";
import {InventoryBookingEditor} from "./inventory-booking-editor";
import {InventoryHoldForm} from "./inventory-hold-form";
import {boardColor,boardSegments,laneLocked,bookingLabel} from "@/lib/inventory/presentation";
const DENSITIES={compact:46,standard:64,wide:88} as const;
export function InventoryBoard({item,items,dates,anchor,lanes,staff,version,requests}:{item:CapacityItem;items:CapacityItem[];dates:string[];anchor:string;lanes:BoardLane[];staff:{id:string;name:string}[];version:number;requests:InventoryRecord[]}){
 const [density,setDensity]=useState<keyof typeof DENSITIES>("compact");const DAY=DENSITIES[density];
 const [preview,setPreview]=useState<{booking:BoardBooking;x:number;y:number}|null>(null);
 function showPreview(node:HTMLElement,booking:BoardBooking){const rect=node.getBoundingClientRect();setPreview({booking,x:Math.max(8,Math.min(rect.left,window.innerWidth-328)),y:Math.max(8,Math.min(rect.bottom+8,window.innerHeight-190))});}
 const scrollRef=useRef<HTMLDivElement>(null);
 const [viewportWidth,setViewportWidth]=useState(0);
 useLayoutEffect(()=>{const node=scrollRef.current;if(!node)return;const observer=new ResizeObserver(()=>setViewportWidth(node.clientWidth));observer.observe(node);setViewportWidth(node.clientWidth);return()=>observer.disconnect();},[]);
 const trailingSpace=Math.max(0,viewportWidth-(120+(dates.length-Math.max(0,dates.indexOf(anchor)))*DAY));
 const anchorOffset=Math.max(0,dates.indexOf(anchor))*DAY;
 useLayoutEffect(()=>{if(scrollRef.current)scrollRef.current.scrollLeft=anchorOffset;},[anchorOffset,dates[0],trailingSpace]);
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date());
 const router=useRouter();const [selection,setSelection]=useState<{date:string;booking?:BoardBooking;number:number|null;version:number}|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const normalCount=lanes.filter(l=>l.kind==="normal").length;
 const locked=(lane:BoardLane,index:number,date:string)=>laneLocked(item,lane,index,normalCount,date);
 function open(date:string,booking?:BoardBooking,number:number|null=null){setSelection({date,booking,number,version});setError("");}
 const [dragging,setDragging]=useState<string|null>(null);
 async function move(key:string,number:number|null){setBusy(true);setPreview(null);setError("");try{const res=await fetch("/api/admin/inventory/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"assign",key,version,unit_number:number})});const data=await res.json();if(!res.ok)throw Error(data.error);router.refresh();}catch(e){setError(e instanceof Error?e.message:"移動できませんでした");}finally{setBusy(false);setDragging(null);}}
 const pointer=useRef<{key:string;x:number;y:number}|null>(null),ignoreClick=useRef(false);
 function pointerDown(e:React.PointerEvent,b:BoardBooking){if(busy||!b.key||e.button!==0||e.pointerType!=="mouse")return;setPreview(null);pointer.current={key:b.key,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}
 function pointerMove(e:React.PointerEvent){const p=pointer.current;if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>6)setDragging(p.key);}
 function pointerUp(e:React.PointerEvent){const p=pointer.current;pointer.current=null;if(!p)return;const moved=Math.hypot(e.clientX-p.x,e.clientY-p.y)>6;setDragging(null);setPreview(null);if(!moved)return;ignoreClick.current=true;const row=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('tr[data-unit]');if(row){const n=row.dataset.unit;void move(p.key,n==='unassigned'?null:Number(n));}}
 function clickBooking(date:string,b?:BoardBooking,n:number|null=null){if(ignoreClick.current){ignoreClick.current=false;return;}setPreview(null);open(date,b,n);}
 return <>
  {error&&<p role="alert" className="mb-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500"><div className="flex items-center gap-3"><span className="hidden sm:inline">ドラッグで番号変更 · 日程は変わりません</span><button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white" onClick={()=>open(anchor)}>＋ 仮押さえ</button><button className="rounded-md border bg-white px-2 py-1 text-slate-700" onClick={()=>scrollRef.current?.scrollTo({left:anchorOffset,behavior:"auto"})}>開始日に戻る</button></div><div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="マスのサイズ">{([["compact","コンパクト"],["standard","標準"],["wide","ゆったり"]] as const).map(([key,label])=><button key={key} onClick={()=>setDensity(key)} aria-pressed={density===key} className={`rounded-md px-2.5 py-1.5 font-medium transition ${density===key?"bg-slate-900 text-white shadow-sm":"hover:bg-slate-100"}`}>{label}</button>)}</div></div>
  <div ref={scrollRef} onScroll={()=>setPreview(null)} className="inventory-grid overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm" style={{maxHeight:"calc(100dvh - 330px)",minHeight:320}}>
   <table className="border-separate border-spacing-0 text-sm" style={{width:120+dates.length*DAY,marginRight:trailingSpace,tableLayout:"fixed"}} aria-label={`${item.name} 台数別の在庫管理表`}>
    <colgroup><col style={{width:36}}/><col style={{width:84}}/>{dates.map(d=><col key={d} style={{width:DAY}}/>)}</colgroup>
    <thead className="sticky top-0 z-30"><tr><th className="sticky left-0 z-40 border-b border-r border-slate-200 bg-slate-50 py-2 text-xs">枠</th><th className="sticky left-9 z-40 border-b border-r border-slate-200 bg-slate-50 px-1 text-[11px]">{item.name}</th>{dates.map(d=>{const day=new Date(`${d}T00:00:00Z`).getUTCDay();return <th key={d} aria-current={d===today?"date":undefined} className={`border-b border-r py-1.5 text-[10px] font-medium ${d===today?"border-t-2 border-t-blue-600 bg-blue-50 text-blue-700":day===0?"bg-rose-50 text-rose-600":day===6?"bg-sky-50 text-sky-700":"bg-slate-50 text-slate-600"}`}><span className="block font-semibold">{Number(d.slice(5,7))}/{Number(d.slice(8))}</span><span className="block text-[9px]">{"日月火水木金土"[day]}</span></th>;})}</tr></thead>
    <tbody>{lanes.map((lane,index)=>{
     const reserve=lane.kind==="reserve",extra=lane.kind==="overflow",unconfigured=lane.kind==="unconfigured",unassigned=lane.kind==="unassigned";
     const labelBg=reserve?"bg-slate-200":extra?"bg-rose-100":"bg-slate-50";
     const segments=boardSegments(lane,dates,d=>locked(lane,index,d),{breakAt:anchor});
     const staffSegments=boardSegments(lane,dates,d=>locked(lane,index,d),{splitPhases:false,breakAt:anchor}).flatMap(s=>s.booking?[s]:Array.from({length:s.span},(_,i)=>({...s,date:dates[dates.indexOf(s.date)+i],span:1})));
     return <Fragment key={lane.key}>
      <tr data-unit={lane.kind==="normal"?lane.number:lane.kind==="unassigned"?"unassigned":undefined} className={dragging&&lane.kind==="normal"?"outline outline-1 -outline-offset-1 outline-indigo-100":""}><th rowSpan={2} className={`sticky left-0 z-20 border-b border-r border-slate-200 text-center font-medium ${labelBg}`}>{unassigned?`未${lane.number}`:extra?`競${lane.number}`:unconfigured?`未${lane.number}`:lane.number}</th><th className={`sticky left-9 z-20 border-b border-dotted border-r border-slate-200 text-[10px] font-normal ${labelBg}`}>{reserve?"予備":"担当者"}</th>{staffSegments.map(s=>{const date=s.date,b=s.booking,inactive=s.inactive;return <td key={date} colSpan={s.span} className="h-6 border-b border-dotted border-r border-slate-200 px-0.5" style={{backgroundColor:reserve||inactive?"#e2e8f0":extra?"#ffe4e6":boardColor(b,b?.start??date)}}><button type="button" disabled={reserve||inactive} aria-describedby={b&&preview?.booking.id===b.id?"inventory-booking-preview":undefined} onKeyDown={e=>{if(e.key==="Escape")setPreview(null);}} onMouseEnter={e=>b&&showPreview(e.currentTarget,b)} onMouseLeave={()=>setPreview(null)} onFocus={e=>b&&showPreview(e.currentTarget,b)} onBlur={()=>setPreview(null)} onPointerDown={e=>b&&pointerDown(e,b)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{pointer.current=null;setDragging(null);}} onDragStart={e=>e.preventDefault()} onClick={()=>clickBooking(date,b,lane.kind==="normal"?lane.number:null)} title={b?undefined:"仮押さえを追加"} aria-label={`${lane.number}枠 ${date} ${b?`${b.staff} ${b.store}`:"仮押さえを追加"}`} className={`flex h-[22px] w-full items-center justify-start rounded bg-white/30 px-0.5 text-[11px] leading-none hover:bg-white/70 disabled:cursor-not-allowed ${b?.staff==="担当者未設定"?"font-bold text-red-600":"text-slate-900"}`}><span className="sticky left-[124px] max-w-full truncate px-1">{b?.staff==="担当者未設定"?"要確認":b?.staff??""}</span></button></td>;})}</tr>
      <tr data-unit={lane.kind==="normal"?lane.number:lane.kind==="unassigned"?"unassigned":undefined} className={dragging&&lane.kind==="normal"?"outline outline-1 -outline-offset-1 outline-indigo-100":""}><th className={`sticky left-9 z-20 h-6 border-b border-r border-slate-200 text-[10px] font-normal ${labelBg}`}>{reserve?"貸出不可":"イベント場所"}</th>{segments.map((s,segmentIndex)=>{const b=s.booking;const next=segments[segmentIndex+1];const spill=next&&!next.booking&&!next.inactive?next.span:0;return <td key={s.date} colSpan={s.span} className={`relative h-[26px] border-b border-r border-slate-200 `} style={{backgroundColor:reserve||s.inactive?"#e2e8f0":extra?"#ffe4e6":boardColor(b,s.date)}}>
       {b&&<button aria-describedby={preview?.booking.id===b.id?"inventory-booking-preview":undefined} onKeyDown={e=>{if(e.key==="Escape")setPreview(null);}} onMouseEnter={e=>showPreview(e.currentTarget,b)} onMouseLeave={()=>setPreview(null)} onFocus={e=>showPreview(e.currentTarget,b)} onBlur={()=>setPreview(null)} onPointerDown={e=>pointerDown(e,b)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{pointer.current=null;setDragging(null);}} onDragStart={e=>e.preventDefault()} onClick={()=>clickBooking(s.date,b)} type="button" style={{width:(s.span+spill)*DAY-2,height:24}} className="inventory-booking cursor-grab select-none active:cursor-grabbing absolute left-0 top-1/2 z-10 -translate-y-1/2 px-1.5 text-left text-[11px] leading-6">
        <InventoryBookingLabel text={bookingLabel(b,s.date)} width={s.span*DAY-2} spillWidth={(s.span+spill)*DAY-2}/>

       </button>}
      </td>;})}</tr>
     </Fragment>;
    })}</tbody>
   </table>
   {lanes.length===0&&<p className="p-8 text-center text-sm text-slate-600">表示する在庫枠がありません。下の在庫設定で台数を登録してください。</p>}
  </div>
  <p className="mt-2 text-xs text-slate-500">番号は手動割当です。未割当の予定は下段に表示します。競合は赤い行で確認でき、配送・返却・点検を含む確保期間が重なる移動は保存できません。</p>
  {preview&&!selection&&<aside id="inventory-booking-preview" role="tooltip" className="pointer-events-none fixed z-[60] w-80 max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl" style={{left:preview.x,top:preview.y}}><p className="break-words font-semibold">{preview.booking.managementNo?`${preview.booking.managementNo}：`:preview.booking.kind!=="request"?"(仮) ":""}{preview.booking.store}</p><p className="mt-2">担当者：{preview.booking.staff}</p><p className="mt-1 text-xs text-slate-600">利用：{preview.booking.start} 〜 {preview.booking.end}</p><p className="mt-1 text-xs text-slate-600">配送：{preview.booking.delivery||"未設定"} ／ 集荷：{preview.booking.pickup||"未設定"}</p><p className="mt-2 text-xs text-slate-500">クリックすると案件の詳細を確認できます</p></aside>}
  {selection&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" onClick={()=>!busy&&setSelection(null)} onKeyDown={e=>{if(e.key==="Escape"&&!busy)setSelection(null);if(e.key==="Tab"){const focusable=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select'));const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><section role="dialog" aria-modal="true" aria-label={selection.booking?"予定の編集・番号指定":"仮押さえを追加"} className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
   <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{selection.booking?"予定の編集・番号指定":"仮押さえを追加"}</h2><button type="button" autoFocus disabled={busy} onClick={()=>setSelection(null)} className="rounded border px-3 py-1">閉じる</button></div>
   {selection.booking?<InventoryBookingEditor requests={requests} key={selection.booking.key} booking={selection.booking} itemId={item.id} items={items} staff={staff} version={selection.version} onClose={()=>setSelection(null)}/>:<InventoryHoldForm items={items} staff={staff} version={selection.version} initialItemId={item.id} initialDate={selection.date} initialNumber={selection.number} onSaved={()=>setSelection(null)}/>}

  </section></div>}
 </>;
}
