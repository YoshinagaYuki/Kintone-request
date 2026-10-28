'use client';
import {useLayoutEffect,useMemo,useRef,type RefObject} from 'react';
import type {CapacityItem} from '@/lib/inventory/availability';
import {bookingOn,type BoardBooking,type BoardLane} from '@/lib/inventory/board';
import {boardColor,boardSegments,bookingLabel,laneLocked} from '@/lib/inventory/presentation';
import type {ScreenDay} from '@/lib/inventory/shared-screen';
import {pinchViewport} from '@/lib/inventory/pinch';
import {mobileWindow,mobileHit,MOBILE_DAY as DAY,MOBILE_LABEL as LABEL,MOBILE_LANE as ROW} from '@/lib/inventory/mobile-viewport';

type Props={item:CapacityItem;dates:string[];lanes:BoardLane[];backgroundDays?:ScreenDay[];today:string;zoom:number;scrollRef:RefObject<HTMLDivElement|null>;trailingSpace:number;onOpen:(date:string,booking?:BoardBooking,number?:number|null)=>void;onZoom:(zoom:number,left:number,top:number)=>void};
/** A viewport-sized surface: the browser never rasterizes a year-wide sticky table on phones. */
export function InventoryMobileBoard(props:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null),spaceRef=useRef<HTMLDivElement>(null),live=useRef(props),sync=useRef<(()=>void)|null>(null);live.current=props;
 const scenes=useMemo(()=>props.lanes.map((lane,index)=>{
  const locked=(date:string)=>laneLocked(props.item,lane,index,0,date);
  const indexed=(segments:ReturnType<typeof boardSegments>)=>segments.map(s=>({...s,day:props.dates.indexOf(s.date)}));
  return {events:indexed(boardSegments(lane,props.dates,locked)),staff:indexed(boardSegments(lane,props.dates,locked,{splitPhases:false}))};
 }),[props.lanes,props.dates,props.item]);
 const sceneRef=useRef(scenes);sceneRef.current=scenes;
 useLayoutEffect(()=>{
  const grid=props.scrollRef.current,canvas=canvasRef.current,space=spaceRef.current,ctx=canvas?.getContext('2d',{alpha:false});if(!grid||!canvas||!space||!ctx)return;
  let zoom=live.current.zoom,frame=0,width=0,height=0,suppressUntil=0;
  let gesture:{distance:number;zoom:number;x:number;y:number;rect:DOMRect}|null=null;
  let pending:{distance:number;center:{x:number;y:number}}|null=null;
  const resizeSpace=()=>{const p=live.current,s=zoom/100,h=56+(p.backgroundDays?20:0);space.style.width=`${(LABEL+p.dates.length*DAY)*s+p.trailingSpace*s}px`;space.style.height=`${(h+p.lanes.length*ROW)*s}px`;};
  const fill=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const text=(value:string,x:number,y:number,w:number,size=11,color='#1e293b',align:CanvasTextAlign='left')=>{
   if(w<=0)return;ctx.save();ctx.beginPath();ctx.rect(x,y-14,w,28);ctx.clip();ctx.font=`${size}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,align==='center'?x+w/2:x+4,y);ctx.restore();
  };
  const draw=()=>{
   const started=performance.now();
   const p=live.current,s=zoom/100,header=56+(p.backgroundDays?20:0),left=grid.scrollLeft,top=grid.scrollTop;
   ctx.setTransform(1,0,0,1,0,0);fill(0,0,canvas.width,canvas.height,'#fff');
   const dpr=Math.min(window.devicePixelRatio||1,2);ctx.setTransform(dpr*s,0,0,dpr*s,0,0);
   const w=width/s,h=height/s,l=left/s,t=top/s,view=mobileWindow({left,top,width,height,scale:s,dates:p.dates.length,lanes:p.lanes.length,header});
   const line=(x:number,y:number,x2:number,y2:number)=>{ctx.strokeStyle='#e2e8f0';ctx.lineWidth=1/s;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();};
   ctx.save();ctx.beginPath();ctx.rect(LABEL,header,w-LABEL,h-header);ctx.clip();
   for(let row=view.firstLane;row<=view.lastLane;row++){
    const lane=p.lanes[row],scene=sceneRef.current[row],y=header+row*ROW-t,reserve=lane.kind==='reserve',overflow=lane.kind==='overflow';
    for(let day=view.firstDay;day<=view.lastDay;day++){
     const date=p.dates[day],x=LABEL+day*DAY-l,inactive=laneLocked(p.item,lane,row,0,date);
     if((reserve||inactive)||overflow)fill(x,y,DAY,ROW,overflow?'#ffe4e6':'#e2e8f0');
     line(x,y,x,y+ROW);
    }
    for(const [staff,segments] of [[true,scene.staff],[false,scene.events]] as const){
     for(let i=0;i<segments.length;i++){
      const seg=segments[i];if(!seg.booking)continue;const day=seg.day,x=LABEL+day*DAY-l,span=seg.span*DAY;if(x+span<LABEL||x>w)continue;
      const b=seg.booking,yy=y+(staff?0:30),color=seg.inactive?'#e2e8f0':overflow?'#ffe4e6':boardColor(b,staff?b.start:seg.date);
      fill(x,yy,span,30,color);
      const next=segments[i+1],spill=!staff&&next&&!next.booking&&!next.inactive?Math.min(next.span,2)*DAY:0;
      const tx=Math.max(LABEL,x);
      text(staff?(b.staff==='担当者未設定'?'要確認':b.staff):bookingLabel(b,seg.date),tx+2,yy+15,Math.min(span+spill,x+span+spill-tx)-4,11,b.staff==='担当者未設定'&&staff?'#dc2626':'#1e293b');
     }
    }
    line(LABEL,y+30,w,y+30);line(LABEL,y+ROW,w,y+ROW);
   }
   ctx.restore();
   if(!p.lanes.length)text('表示する在庫枠がありません',LABEL,header+40,Math.max(0,w-LABEL),12);
   // Frozen equipment labels and dates are drawn once each, rather than composited per cell.
   fill(0,header,LABEL,h-header,'#f8fafc');
   for(let row=view.firstLane;row<=view.lastLane;row++){
    const lane=p.lanes[row],y=header+row*ROW-t;if(y+ROW<header)continue;
    ctx.save();ctx.beginPath();ctx.rect(0,header,LABEL,h-header);ctx.clip();
    const reserve=lane.kind==='reserve',bad=lane.kind==='overflow';fill(0,y,LABEL,ROW,bad?'#ffe4e6':reserve?'#e2e8f0':'#f8fafc');
    text(`${lane.kind==='unassigned'?'未':bad?'競':lane.kind==='unconfigured'?'未':''}${lane.number}`,0,y+30,36,13,'#17243b','center');
    text(reserve?'予備':'担当者',36,y+15,84,10,'#475569','center');text(reserve?'使用可能':'イベント場所',36,y+45,84,10,'#475569','center');line(36,y,36,y+ROW);line(36,y+30,LABEL,y+30);line(0,y+ROW,LABEL,y+ROW);ctx.restore();
   }
   fill(0,0,w,header,'#f8fafc');
   ctx.save();ctx.beginPath();ctx.rect(LABEL,0,w-LABEL,header);ctx.clip();
   for(let day=view.firstDay;day<=view.lastDay;day++){
    const date=p.dates[day],x=LABEL+day*DAY-l,weekday=new Date(`${date}T00:00:00Z`).getUTCDay(),isToday=date===p.today;
    fill(x,0,DAY,56,isToday?'#eff6ff':weekday===0?'#fff1f2':weekday===6?'#f0f9ff':'#f8fafc');
    if(isToday)fill(x,0,DAY,2,'#2563eb');const color=isToday?'#2563eb':weekday===0?'#e11d48':weekday===6?'#0284c7':'#475569';
    text(`${Number(date.slice(5,7))}/${Number(date.slice(8))}`,x,21,DAY,10,color,'center');text('日月火水木金土'[weekday],x,41,DAY,9,color,'center');line(x,0,x,header);
    if(p.backgroundDays){const d=p.backgroundDays[day];fill(x,56,DAY,20,d.remaining!==null&&d.remaining<0?'#ffe4e6':'#eef2ff');text(d.remaining===null?'—':String(d.remaining),x,66,DAY,11,d.remaining!==null&&d.remaining<0?'#be123c':'#312e81','center');}
   }
   ctx.restore();fill(0,0,LABEL,56,'#f8fafc');text('枠',0,28,36,11,'#17243b','center');
   const name=p.item.name;const split=name.length>9; if(split){text(name.slice(0,8),36,20,84,10,'#17243b','center');text(name.slice(8),36,37,84,10,'#17243b','center');}else text(name,36,28,84,10,'#17243b','center');
   line(36,0,36,56);line(LABEL,0,LABEL,h);line(0,56,w,56);
   if(p.backgroundDays){fill(0,56,LABEL,20,'#eef2ff');text('背景残数',0,66,LABEL,10,'#312e81','center');line(0,76,w,76);}
   canvas.dataset.frameMs=(performance.now()-started).toFixed(2);canvas.dataset.visibleCells=String(Math.max(0,view.lastDay-view.firstDay+1)*Math.max(0,view.lastLane-view.firstLane+1));
  };
  const paint=()=>{frame=0;if(gesture&&pending){const n=pinchViewport(gesture,pending.distance,pending.center);zoom=n.zoom;resizeSpace();grid.scrollLeft=n.left;grid.scrollTop=n.top;}draw();};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint);};
  const resize=()=>{width=grid.clientWidth;height=grid.clientHeight;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;resizeSpace();schedule();};
  sync.current=()=>{zoom=live.current.zoom;resizeSpace();schedule();};
  const observer=new ResizeObserver(resize);observer.observe(grid);resize();grid.addEventListener('scroll',schedule,{passive:true});
  const distance=(e:TouchEvent)=>Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  const point=(e:TouchEvent,rect:DOMRect)=>({x:(e.touches[0].clientX+e.touches[1].clientX)/2-rect.left,y:(e.touches[0].clientY+e.touches[1].clientY)/2-rect.top});
  const end=()=>{if(!gesture)return;if(frame)cancelAnimationFrame(frame);frame=0;if(pending){const n=pinchViewport(gesture,pending.distance,pending.center);zoom=Math.round(n.zoom);resizeSpace();grid.scrollLeft=Math.max(0,gesture.x*zoom/100-pending.center.x);grid.scrollTop=Math.max(0,gesture.y*zoom/100-pending.center.y);}gesture=null;pending=null;suppressUntil=Date.now()+500;draw();live.current.onZoom(zoom,grid.scrollLeft,grid.scrollTop);};
  const start=(e:TouchEvent)=>{if(e.touches.length!==2){end();return;}if(e.cancelable)e.preventDefault();const rect=grid.getBoundingClientRect(),center=point(e,rect);gesture={distance:Math.max(1,distance(e)),zoom,x:(grid.scrollLeft+center.x)/(zoom/100),y:(grid.scrollTop+center.y)/(zoom/100),rect};pending={distance:gesture.distance,center};suppressUntil=Date.now()+500;};
  const move=(e:TouchEvent)=>{if(e.touches.length!==2)return;if(e.cancelable)e.preventDefault();if(!gesture){start(e);return;}pending={distance:distance(e),center:point(e,gesture.rect)};schedule();};
  const click=(e:MouseEvent)=>{if(Date.now()<suppressUntil||gesture)return;const p=live.current,r=grid.getBoundingClientRect(),header=56+(p.backgroundDays?20:0),hit=mobileHit(e.clientX-r.left,e.clientY-r.top,grid.scrollLeft,grid.scrollTop,zoom/100,header,p.dates.length,p.lanes.length);if(!hit)return;const lane=p.lanes[hit.lane],date=p.dates[hit.day];if(laneLocked(p.item,lane,hit.lane,0,date))return;p.onOpen(date,bookingOn(lane,date),lane.kind==='normal'||lane.kind==='reserve'?lane.number:null);};
  grid.addEventListener('touchstart',start,{passive:false});grid.addEventListener('touchmove',move,{passive:false});grid.addEventListener('touchend',end);grid.addEventListener('touchcancel',end);grid.addEventListener('click',click);
  return()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);sync.current=null;grid.removeEventListener('scroll',schedule);grid.removeEventListener('touchstart',start);grid.removeEventListener('touchmove',move);grid.removeEventListener('touchend',end);grid.removeEventListener('touchcancel',end);grid.removeEventListener('click',click);};
 },[props.scrollRef]);
 useLayoutEffect(()=>sync.current?.(),[props.zoom,props.dates,props.lanes,props.backgroundDays,props.trailingSpace]);
 const bookings=[...new Map(props.lanes.flatMap(l=>l.bookings.map(b=>[b.key??b.id,b] as const))).values()];
 return <><div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div ref={props.scrollRef} tabIndex={0} className="inventory-grid overflow-auto" style={{height:'60dvh',minHeight:300,touchAction:'pan-x pan-y'}} aria-label={`${props.item.name} 在庫ガントチャート。1本指でスクロール、2本指で拡大・縮小`}><div ref={spaceRef}/></div><canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" aria-hidden="true"/></div><label className="sr-only focus-within:not-sr-only">予定を選択して編集<select aria-label="予定を選択して編集" value="" onChange={e=>{const b=bookings.find(b=>(b.key??b.id)===e.target.value);if(b)props.onOpen(b.start,b,b.unitNumber??null);}}><option value="">予定を選択</option>{bookings.map(b=><option key={b.key??b.id} value={b.key??b.id}>{b.staff} {b.start}〜{b.end} {b.managementNo} {b.store}</option>)}</select></label></>;
}
