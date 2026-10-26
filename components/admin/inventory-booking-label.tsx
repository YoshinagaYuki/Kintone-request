"use client";
import {useLayoutEffect,useRef,useState} from 'react';
/** Keep the beginning visible even when a long booking starts outside the viewport. */
export function InventoryBookingLabel({text,width,spillWidth,scale=1}:{text:string;width:number;spillWidth:number;scale?:number}){
 const measure=useRef<HTMLSpanElement>(null);const[natural,setNatural]=useState(0),[visibleWidth,setVisibleWidth]=useState(spillWidth);
 useLayoutEffect(()=>{
  const node=measure.current,host=node?.parentElement,grid=host?.closest<HTMLElement>('.inventory-grid');if(!node||!host)return;
  setNatural(node.getBoundingClientRect().width/scale);let frame=0;
  const update=()=>{frame=0;if(!grid){setVisibleWidth(spillWidth);return;}const r=host.getBoundingClientRect(),g=grid.getBoundingClientRect();setVisibleWidth(Math.max(0,Math.min(r.right,g.right)-Math.max(r.left,g.left+124*scale))/scale);};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};const observer=new ResizeObserver(schedule);observer.observe(host);if(grid){observer.observe(grid);grid.addEventListener('scroll',schedule,{passive:true});}update();
  return()=>{observer.disconnect();grid?.removeEventListener('scroll',schedule);if(frame)cancelAnimationFrame(frame);};
 },[text,width,spillWidth,scale]);
 const readableWidth=Math.min(width,visibleWidth);const fontSize=natural>Math.max(0,readableWidth-12)?Math.max(10,11*(readableWidth-12)/natural):11;
 const needed=Math.ceil(natural*(fontSize/11))+16;const labelWidth=Math.min(spillWidth,visibleWidth,needed);
 return <><span ref={measure} aria-hidden="true" className="pointer-events-none absolute invisible whitespace-nowrap text-[11px]" style={{width:'max-content'}}>{text}</span><span className="inventory-booking-text sticky left-[124px] inline-block overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{fontSize,width:Math.max(0,labelWidth-12),maxWidth:'100%'}}>{text}</span></>;
}
