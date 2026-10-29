"use client";
import{bookingPhase}from'@/lib/inventory/board';
import{InventoryTransportIcon}from'./inventory-transport-icon';
import type{ScreenDay}from'@/lib/inventory/shared-screen';
import type {InventoryRecord} from '@/lib/inventory/model';
import {useState,useRef,useLayoutEffect,useEffect,useSyncExternalStore,Fragment} from "react";
import {useRouter} from "next/navigation";
import {type BoardBooking,type BoardLane} from "@/lib/inventory/board";
import type {CapacityItem} from "@/lib/inventory/availability";
import {InventoryBookingLabel} from "./inventory-booking-label";
import {InventoryBookingEditor} from "./inventory-booking-editor";
import {InventoryHoldForm} from "./inventory-hold-form";
import {boardColor,boardStroke,boardSegments,laneLocked,bookingLabel,isTransportDay} from "@/lib/inventory/presentation";
import {pinchViewport,pinchTransform} from "@/lib/inventory/pinch";
import {InventoryMobileBoard} from "./inventory-mobile-board";
const mobileQuery='(max-width: 639px), (pointer: coarse)';
const subscribeMobile=(notify:()=>void)=>{const query=window.matchMedia(mobileQuery);query.addEventListener('change',notify);return()=>query.removeEventListener('change',notify);};
const mobileSnapshot=()=>window.matchMedia(mobileQuery).matches;
const DAY=46;
export function InventoryBoard({item,items,dates,anchor,lanes,staff,version,requests,backgroundDays}:{backgroundDays?:ScreenDay[];item:CapacityItem;items:CapacityItem[];dates:string[];anchor:string;lanes:BoardLane[];staff:{id:string;name:string}[];version:number;requests:InventoryRecord[]}){
 const mobile=useSyncExternalStore(subscribeMobile,mobileSnapshot,()=>false);
 const [zoom,setZoom]=useState(100),[zoomInput,setZoomInput]=useState("100");const scale=zoom/100;const previousView=useRef({anchor:"",scale});const viewNode=useRef<HTMLDivElement|null>(null);const zoomRef=useRef(zoom);zoomRef.current=zoom;const pinchView=useRef<{left:number;top:number}|null>(null);
 function changeZoom(value:number){const next=Math.max(50,Math.min(150,Math.round(value)));setZoom(next);setZoomInput(String(next));}
 const [preview,setPreview]=useState<{booking:BoardBooking;x:number;y:number}|null>(null);
 function showPreview(node:HTMLElement,booking:BoardBooking){const rect=node.getBoundingClientRect();setPreview({booking,x:Math.max(8,Math.min(rect.left,window.innerWidth-328)),y:Math.max(8,Math.min(rect.bottom+8,window.innerHeight-190))});}
 const scrollRef=useRef<HTMLDivElement>(null);
 const [viewportWidth,setViewportWidth]=useState(0);
 useLayoutEffect(()=>{const node=scrollRef.current;if(!node)return;const observer=new ResizeObserver(()=>setViewportWidth(node.clientWidth));observer.observe(node);setViewportWidth(node.clientWidth);return()=>observer.disconnect();},[mobile]);
 const trailingSpace=Math.max(0,viewportWidth/scale-(120+(dates.length-Math.max(0,dates.indexOf(anchor)))*DAY));
 const anchorOffset=Math.max(0,dates.indexOf(anchor))*DAY;
 useLayoutEffect(()=>{const node=scrollRef.current;if(!node)return;const key=`${anchor}:${dates[0]}`;if(pinchView.current){const table=node.querySelector("table");if(table){table.style.transform="";table.style.transformOrigin="";table.style.willChange="";}node.scrollLeft=pinchView.current.left;node.scrollTop=pinchView.current.top;pinchView.current=null;}else node.scrollLeft=viewNode.current===node&&previousView.current.anchor===key?node.scrollLeft*scale/previousView.current.scale:anchorOffset*scale;previousView.current={anchor:key,scale};viewNode.current=node;},[anchorOffset,dates[0],anchor,scale,mobile]);
 // Only two-finger gestures change the chart scale; single-finger scrolling stays native.
 useEffect(()=>{
  if(mobile)return;
  const node=scrollRef.current;if(!node)return;
  const table=node.querySelector('table');if(!table)return;
  let gesture:{distance:number;zoom:number;x:number;y:number}|null=null,suppressClickUntil=0,frame=0;
  let latest:{distance:number;center:{x:number;y:number}}|null=null;
  const distance=(touches:TouchList)=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  const center=(touches:TouchList)=>{const rect=node.getBoundingClientRect();return {x:(touches[0].clientX+touches[1].clientX)/2-rect.left,y:(touches[0].clientY+touches[1].clientY)/2-rect.top};};
  // Preview with a compositor transform, without laying out thousands of cells or
  // rendering React on each touchmove. Commit real table geometry only on release.
  const paint=()=>{
   frame=0;if(!gesture||!latest)return;
   const next=pinchViewport(gesture,latest.distance,latest.center);
   table.style.transform=pinchTransform(gesture,next.zoom,latest.center,{left:node.scrollLeft,top:node.scrollTop});
  };
  const end=()=>{
   if(frame)cancelAnimationFrame(frame);frame=0;
   if(gesture&&latest){
    const next=pinchViewport(gesture,latest.distance,latest.center),zoom=Math.round(next.zoom);
    const target={left:Math.max(0,gesture.x*zoom/100-latest.center.x),top:Math.max(0,gesture.y*zoom/100-latest.center.y)};
    if(zoom!==zoomRef.current){pinchView.current=target;changeZoom(zoom);}
    else{table.style.transform='';table.style.transformOrigin='';table.style.willChange='';node.scrollLeft=target.left;node.scrollTop=target.top;}
    suppressClickUntil=Date.now()+700;
   }
   gesture=null;latest=null;
  };
  const begin=(event:TouchEvent)=>{
   if(event.touches.length!==2){end();return;}
   if(event.cancelable)event.preventDefault();
   const point=center(event.touches);
   gesture={distance:Math.max(1,distance(event.touches)),zoom:zoomRef.current,x:(node.scrollLeft+point.x)/(zoomRef.current/100),y:(node.scrollTop+point.y)/(zoomRef.current/100)};
   latest={distance:gesture.distance,center:point};table.style.transformOrigin='0 0';table.style.willChange='transform';
   suppressClickUntil=Date.now()+700;setPreview(null);
  };
  const move=(event:TouchEvent)=>{
   if(event.touches.length!==2)return;
   if(event.cancelable)event.preventDefault();
   if(!gesture){begin(event);return;}
   latest={distance:distance(event.touches),center:center(event.touches)};
   if(!frame)frame=requestAnimationFrame(paint);
   suppressClickUntil=Date.now()+700;
  };
  const click=(event:MouseEvent)=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();}};
  node.addEventListener('touchstart',begin,{passive:false});node.addEventListener('touchmove',move,{passive:false});node.addEventListener('touchend',end);node.addEventListener('touchcancel',end);node.addEventListener('click',click,true);
  return()=>{if(frame)cancelAnimationFrame(frame);table.style.transform="";table.style.transformOrigin="";table.style.willChange="";node.removeEventListener('touchstart',begin);node.removeEventListener('touchmove',move);node.removeEventListener('touchend',end);node.removeEventListener('touchcancel',end);node.removeEventListener('click',click,true);};
 },[mobile]);
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date());
 const[dense,setDense]=useState(true);
 const router=useRouter();const [selection,setSelection]=useState<{date:string;booking?:BoardBooking;number:number|null;version:number;status:'hold'|'registered';copy?:boolean}|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const normalCount=lanes.filter(l=>l.kind==="normal").length;
 const locked=(lane:BoardLane,index:number,date:string)=>laneLocked(item,lane,index,normalCount,date);
 function open(date:string,booking?:BoardBooking,number:number|null=null,status:'hold'|'registered'='hold'){setSelection({date,booking,number,version,status});setError("");}
 function clickBooking(date:string,b?:BoardBooking,n:number|null=null){if(b?.unitSwitches?.length||b?.sourceUnitSwitches?.length)b=requests.find(r=>r.booking.key===b?.key)?.booking??b;setPreview(null);open(date,b,n);}
 return <>
  {error&&<p role="alert" className="mb-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  <div className="inventory-board-controls mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><div className="flex items-center gap-3"><span className="hidden sm:inline">予定をタップして編集</span><button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white" onClick={()=>open(anchor)}>＋ 在庫確保</button><button className="rounded-md border bg-white px-2 py-1 text-slate-700" onClick={()=>{const index=dates.indexOf(today);if(index>=0){scrollRef.current?.scrollTo({left:index*DAY*scale,behavior:"auto"});}else{const params=new URLSearchParams(window.location.search);params.set("start",today);params.delete("end");router.push(`?${params}`);}}}>本日に戻す</button></div><div className="flex items-center gap-2">{!mobile&&<button type="button" onClick={()=>setDense(p=>!p)} className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-600" aria-label="行の表示を切り替え">{dense?'2段で表示':'一覧で表示'}</button>}<div className="inventory-zoom flex min-w-0 items-center gap-2 rounded-lg border bg-white px-2 py-1 text-slate-700"><input aria-label="表示倍率" type="range" min={50} max={150} step={1} value={zoom} onChange={e=>changeZoom(Number(e.target.value))} className="w-12 min-w-0 accent-indigo-600 sm:w-24"/><label className="flex items-center gap-0.5"><input aria-label="表示倍率（パーセント）" type="number" inputMode="numeric" min={50} max={150} step={1} value={zoomInput} onChange={e=>{setZoomInput(e.target.value);const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=50&&n<=150)setZoom(n);}} onBlur={()=>changeZoom(zoomInput===''?zoom:Number(zoomInput))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}} className="w-12 rounded border px-1 py-1 text-right"/><span>%</span></label></div></div></div>
  {mobile?<InventoryMobileBoard item={item} dates={dates} lanes={lanes} backgroundDays={backgroundDays} today={today} zoom={zoom} scrollRef={scrollRef} trailingSpace={trailingSpace} onOpen={clickBooking} onZoom={(next,left,top)=>{if(next!==zoomRef.current)pinchView.current={left,top};changeZoom(next);}}/>:<div ref={scrollRef} onScroll={()=>setPreview(null)} className={`inventory-grid ${dense?'inventory-dense':''} overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm`} style={{maxHeight:dense?"calc(100dvh - 210px)":"calc(100dvh - 330px)",minHeight:320}}>
   <table className="border-separate border-spacing-0 text-sm" style={{width:120+dates.length*DAY,marginRight:trailingSpace,tableLayout:"fixed",zoom:scale}} aria-label={`${item.name} 台数別の在庫管理表`}>
    <colgroup><col style={{width:36}}/><col style={{width:84}}/>{dates.map(d=><col key={d} style={{width:DAY}}/>)}</colgroup>
    <thead className="sticky top-0 z-30"><tr><th className="sticky left-0 z-40 border-b border-r border-slate-200 bg-slate-50 py-2 text-xs">枠</th><th className="sticky left-9 z-40 border-b border-r border-slate-200 bg-slate-50 px-1 text-[11px]">{item.name}</th>{dates.map(d=>{const day=new Date(`${d}T00:00:00Z`).getUTCDay();return <th key={d} aria-current={d===today?"date":undefined} className={`border-b border-r py-1.5 text-[10px] font-medium ${d===today?"border-t-2 border-t-blue-600 bg-blue-50 text-blue-700":day===0?"bg-rose-50 text-rose-600":day===6?"bg-sky-50 text-sky-700":"bg-slate-50 text-slate-600"}`}><span className="block font-semibold">{Number(d.slice(5,7))}/{Number(d.slice(8))}</span><span className="block text-[9px]">{"日月火水木金土"[day]}</span></th>;})}</tr>{backgroundDays&&<tr aria-label="背景残数" className="bg-indigo-50 text-indigo-950"><th scope="row" colSpan={2} className="sticky left-0 z-40 border-b border-r border-indigo-100 bg-indigo-50 px-1 text-center text-[10px] font-medium" style={{height:20,lineHeight:'18px',paddingTop:0,paddingBottom:0}}>背景残数</th>{backgroundDays.map(d=><td key={d.date} aria-label={`${d.date} 背景残数 ${d.remaining===null?'未設定':`${d.remaining}枚`}`} title={d.remaining===null?'背景スクリーンの在庫が未設定です':`大小共通：保有${d.total}枚 − 予備${d.reserve}枚 − 確保${d.used}枚`} className={`border-b border-r border-indigo-100 text-center text-[11px] font-medium tabular-nums ${d.remaining!==null&&d.remaining<0?'bg-rose-100 text-rose-700':d.remaining===0?'bg-amber-100 text-amber-900':''}`} style={{height:20,lineHeight:'18px',padding:0}}>{d.remaining??'—'}</td>)}</tr>}</thead>
    <tbody>{lanes.map((lane,index)=>{
     const reserve=lane.kind==="reserve",extra=lane.kind==="overflow",unconfigured=lane.kind==="unconfigured",unassigned=lane.kind==="unassigned";
     const labelBg=reserve?"bg-slate-200":extra?"bg-rose-100":"bg-slate-50";
     const segments=boardSegments(lane,dates,d=>locked(lane,index,d),{}).flatMap(s=>dense&&!s.booking?Array.from({length:s.span},(_,i)=>({...s,date:dates[dates.indexOf(s.date)+i],span:1})):[s]);
     const staffSegments=boardSegments(lane,dates,d=>locked(lane,index,d),{splitPhases:false}).flatMap(s=>s.booking?[s]:Array.from({length:s.span},(_,i)=>({...s,date:dates[dates.indexOf(s.date)+i],span:1})));
     return <Fragment key={lane.key}>
      {!dense&&<tr data-unit={(lane.kind==="normal"||lane.kind==="reserve")?lane.number:lane.kind==="unassigned"?"unassigned":undefined}><th rowSpan={2} className={`sticky left-0 z-20 border-b border-r border-slate-200 text-center font-medium ${labelBg}`}>{unassigned?`未${lane.number}`:extra?`競${lane.number}`:unconfigured?`未${lane.number}`:lane.number}</th><th className={`sticky left-9 z-20 border-b border-dotted border-r border-slate-200 text-[10px] font-normal ${labelBg}`}>{reserve?"予備":"担当者"}</th>{staffSegments.map(s=>{const date=s.date,b=s.booking,inactive=s.inactive;return <td key={date} colSpan={s.span} className="h-6 border-b border-dotted border-r border-slate-200 px-0.5" style={{backgroundColor:(reserve&&!b)||inactive?"#e2e8f0":"#fff"}}><button type="button" disabled={inactive} aria-describedby={b&&preview?.booking.id===b.id?"inventory-booking-preview":undefined} onKeyDown={e=>{if(e.key==="Escape")setPreview(null);}} onMouseEnter={e=>b&&showPreview(e.currentTarget,b)} onMouseLeave={()=>setPreview(null)} onFocus={e=>b&&showPreview(e.currentTarget,b)} onBlur={()=>setPreview(null)} onClick={()=>clickBooking(date,b,(lane.kind==="normal"||lane.kind==="reserve")?lane.number:null)} title={b?undefined:"在庫確保"} aria-label={`${lane.number}枠 ${date} ${b?`${b.staff} ${b.store}`:"在庫確保"}`} style={{touchAction:"pan-x pan-y",...(b?{background:inactive?"#e2e8f0":extra?"#ffe4e6":`linear-gradient(180deg,#ffffff88,${boardColor(b,b.start)})`,border:`1px solid ${extra?"#fda4af":inactive?"#cbd5e1":boardStroke(b,b.start)}`,borderLeftWidth:3,borderRadius:7,boxShadow:"0 1px 2px #0f172a08"}:{})}} className={`${b?"cursor-pointer select-none":""} flex h-[22px] w-full items-center justify-start rounded bg-transparent px-0.5 text-[11px] leading-none hover:bg-white/70 disabled:cursor-not-allowed ${b?.staff==="担当者未設定"?"font-bold text-red-600":"text-slate-900"}`}><span className="sticky left-[124px] max-w-full truncate px-1">{b?.staff==="担当者未設定"?"要確認":b?.staff??""}</span></button></td>;})}</tr>}
      <tr data-unit={(lane.kind==="normal"||lane.kind==="reserve")?lane.number:lane.kind==="unassigned"?"unassigned":undefined}>{dense&&<th className={`sticky left-0 z-20 border-b border-r border-slate-200 text-center font-medium ${labelBg}`}>{unassigned?`未${lane.number}`:extra?`競${lane.number}`:unconfigured?`未${lane.number}`:lane.number}</th>}<th className={`sticky left-9 z-20 border-b border-r border-slate-200 text-[10px] font-normal ${labelBg}`} style={{height:26}}>{reserve?"使用可能":dense?"担当・店舗":"イベント場所"}</th>{segments.map((s,segmentIndex)=>{const b=s.booking;const next=segments[segmentIndex+1];const spill=next&&!next.booking&&!next.inactive?Math.min(next.span,2):0;return <td key={s.date} colSpan={s.span} className={`relative border-b border-r border-slate-200 `} style={{height:26,backgroundColor:(reserve&&!b)||s.inactive?"#e2e8f0":"#fff"}}>
       {dense&&!b&&<button type="button" disabled={s.inactive} aria-label={`${lane.number}枠 ${s.date} 在庫確保`} onClick={()=>clickBooking(s.date,undefined,(lane.kind==='normal'||lane.kind==='reserve')?lane.number:null)} className="block h-[25px] w-full hover:bg-blue-50 disabled:cursor-not-allowed"/>}
       {b&&<span aria-hidden="true" className="pointer-events-none absolute inset-y-0.5" style={{left:s.date===b.from?1:0,right:dates[dates.indexOf(s.date)+s.span-1]===b.to?1:0,backgroundColor:extra?"#ffe4e6":boardColor(b,s.date),borderTop:`1px solid ${boardStroke(b,s.date)}`,borderBottom:`1px solid ${boardStroke(b,s.date)}`,borderLeft:s.date===b.from?`1px solid ${boardStroke(b,s.date)}`:undefined,borderRight:dates[dates.indexOf(s.date)+s.span-1]===b.to?`1px solid ${boardStroke(b,s.date)}`:undefined,borderRadius:`${s.date===b.from?7:0}px ${dates[dates.indexOf(s.date)+s.span-1]===b.to?7:0}px ${dates[dates.indexOf(s.date)+s.span-1]===b.to?7:0}px ${s.date===b.from?7:0}px`}}/>}
       {b&&<button aria-describedby={preview?.booking.id===b.id?"inventory-booking-preview":undefined} onKeyDown={e=>{if(e.key==="Escape")setPreview(null);}} onMouseEnter={e=>showPreview(e.currentTarget,b)} onMouseLeave={()=>setPreview(null)} onFocus={e=>showPreview(e.currentTarget,b)} onBlur={()=>setPreview(null)} onClick={()=>clickBooking(s.date,b)} type="button" style={{width:(bookingPhase(b,s.date)==='usage'?s.span+spill:s.span)*DAY-2,height:24,touchAction:"pan-x pan-y"}} className="inventory-booking cursor-pointer select-none absolute left-0 top-1/2 z-10 -translate-y-1/2 px-1.5 text-left text-[11px] leading-6">
        {bookingPhase(b,s.date)==='usage'?<InventoryBookingLabel scale={scale} text={dense?`${b.staff==='担当者未設定'?'要確認':b.staff} · ${bookingLabel(b,s.date)}`:bookingLabel(b,s.date)} width={s.span*DAY-2} spillWidth={(s.span+spill)*DAY-2}/>:<span className="flex h-full w-full items-center justify-center text-slate-600" title={isTransportDay(b,s.date)?bookingPhase(b,s.date)==='delivery'?'納品日':'集荷日':bookingPhase(b,s.date)==='outbound'?'発送・往路輸送（余裕期間を含む）':bookingPhase(b,s.date)==='inbound'?'返送（余裕期間を含む）':'確保期間'}>{isTransportDay(b,s.date)?<><span className="sr-only">{bookingPhase(b,s.date)==='delivery'?'納品日':'集荷日'}</span><InventoryTransportIcon kind={bookingPhase(b,s.date)==='delivery'?'delivery':'pickup'}/></>:<span className="text-[10px] text-slate-400">{bookingLabel(b,s.date)}</span>}</span>}

       </button>}
      </td>;})}</tr>
     </Fragment>;
    })}</tbody>
   </table>
   {lanes.length===0&&<p className="p-8 text-center text-sm text-slate-600">表示する在庫枠がありません。下の在庫設定で台数を登録してください。</p>}
  </div>}
  <p className="mt-2 text-xs text-slate-500">空き番号を自動選択し、保存後は固定します。番号の変更は予定の編集画面で行います。未割当は下段、競合は赤い行に表示します。配送・集荷のアイコンは当日を示します。輸送期間は表示せず、空き判定に反映します。</p>
  {preview&&!selection&&<aside id="inventory-booking-preview" role="tooltip" className="pointer-events-none fixed z-[60] w-80 max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl" style={{left:preview.x,top:preview.y}}><p className="break-words font-semibold">{preview.booking.managementNo?`${preview.booking.managementNo}：`:(preview.booking.kind!=="request"||preview.booking.status==='hold')?"(仮) ":""}{preview.booking.store}</p><p className="mt-2">担当者：{preview.booking.staff}</p><p className="mt-1 text-xs text-slate-600">利用：{preview.booking.start} 〜 {preview.booking.end}</p><p className="mt-1 text-xs text-slate-600">配送：{preview.booking.deliveryRequired===false?"なし":preview.booking.delivery||"未設定"} ／ 集荷：{preview.booking.pickupRequired===false?"なし":preview.booking.pickup||"未設定"}</p><p className="mt-1 text-xs text-slate-500">倉庫確保：{preview.booking.from} 〜 {preview.booking.to}（輸送・余裕を含む）</p><p className="mt-2 text-xs text-slate-500">タップすると案件の詳細を確認できます</p></aside>}
  {selection&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" onClick={()=>!busy&&setSelection(null)} onKeyDown={e=>{if(e.key==="Escape"&&!busy)setSelection(null);if(e.key==="Tab"){const focusable=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,textarea'));const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><section role="dialog" aria-modal="true" aria-label={selection.copy?"コピーから新規申請":selection.booking?"予定の編集・番号指定":selection.status==='registered'?"確定分を追加":"在庫確保"} className="inventory-editor flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={e=>e.stopPropagation()}>
   <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-white p-4 sm:px-6"><h2 className="text-lg font-bold">{selection.copy?"コピーから新規申請":selection.booking?"予定の編集・番号指定":selection.status==='registered'?"確定分を追加":"在庫確保"}</h2><button type="button" autoFocus disabled={busy} onClick={()=>setSelection(null)} className="shrink-0 whitespace-nowrap rounded border px-3 py-1">閉じる</button></div>
   <div className="inventory-editor-body min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">{selection.booking?<InventoryBookingEditor requests={requests} onCopyStart={()=>setSelection({...selection,copy:true})} key={selection.booking.key} booking={selection.booking} itemId={item.id} items={items} staff={staff} version={selection.version} onClose={()=>setSelection(null)}/>:<InventoryHoldForm items={items} staff={staff} version={selection.version} initialItemId={item.id} initialDate={selection.date} initialStatus={selection.status} initialNumber={selection.number} onSaved={()=>setSelection(null)}/>}</div>
  </section></div>}
 </>;
}
