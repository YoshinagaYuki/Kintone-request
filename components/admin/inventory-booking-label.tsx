"use client";
import {useLayoutEffect,useRef,useState} from 'react';
/** Single-line spreadsheet-style overflow, bounded before the next occupied cell. */
export function InventoryBookingLabel({text,width,spillWidth}:{text:string;width:number;spillWidth:number}){
 const measure=useRef<HTMLSpanElement>(null);const [natural,setNatural]=useState(0);
 useLayoutEffect(()=>{if(measure.current)setNatural(measure.current.getBoundingClientRect().width);},[text]);
 const fontSize=natural>Math.max(0,width-12)?Math.max(10,11*(width-12)/natural):11;
 const needed=Math.ceil(natural*(fontSize/11))+16;
 const labelWidth=Math.min(spillWidth,needed);
 return <><span ref={measure} aria-hidden="true" className="pointer-events-none absolute invisible whitespace-nowrap text-[11px]" style={{width:'max-content'}}>{text}</span><span className="inventory-booking-text sticky left-[124px] inline-block overflow-hidden text-ellipsis whitespace-nowrap align-middle" style={{fontSize,width:Math.max(0,labelWidth-12),maxWidth:'100%'}}>{text}</span></>;
}
