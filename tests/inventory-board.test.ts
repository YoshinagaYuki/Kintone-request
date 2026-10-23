import {test} from "node:test";
import {strict as assert} from "node:assert";
import {layoutBoard,bookingOn,bookingPhase,type BoardBooking} from "../lib/inventory/board";
import {addDays} from "../lib/inventory/gantt";
const dates=Array.from({length:10},(_,i)=>addDays("2026-10-23",i));
const item={id:"item",name:"JET Cola",total_count:3,reserve_count:1};
const booking=(id:string,from:string,to:string,group=id):BoardBooking=>({id,group,kind:"request",staff:"担当",store:"店舗",managementNo:"100",status:"registered",from,to,start:from,end:to,delivery:"",pickup:"",href:"/admin/requests/"+id});
test("board renders empty inventory slots plus separate reserve rows",()=>{const rows=layoutBoard(item,dates,[]);assert.deepEqual(rows.map(r=>r.kind),["normal","normal","reserve"]);assert.equal(rows.every(r=>!r.bookings.length),true);});
test("nonoverlapping requests reuse one lane; inclusive boundary requires a different lane",()=>{const rows=layoutBoard(item,dates,[booking("a","2026-10-23","2026-10-25"),booking("b","2026-10-26","2026-10-28"),booking("c","2026-10-25","2026-10-26")]);assert.deepEqual(rows[0].bookings.map(b=>b.id),["a","b"]);assert.equal(rows[1].bookings[0].id,"c");});
test("overcapacity is shown explicitly and never consumes a reserve slot",()=>{const rows=layoutBoard(item,dates,["a","b","c"].map(id=>booking(id,"2026-10-23","2026-10-25")));assert.equal(rows.find(r=>r.kind==="reserve")?.bookings.length,0);assert.equal(rows.find(r=>r.kind==="overflow")?.bookings[0].id,"c");});
test("an extension stays on the parent lane and the latest child wins an overlapping day",()=>{const a=booking("a","2026-10-23","2026-10-27","root:0"),b=booking("b","2026-10-26","2026-10-30","root:0");const rows=layoutBoard(item,dates,[a,b]);assert.equal(rows[0].bookings.length,2);assert.equal(bookingOn(rows[0],"2026-10-26")?.id,"b");assert.equal(rows[1].bookings.length,0);});
test("dated stock reductions limit eligible lanes over the whole booking and show excess",()=>{const scheduled={...item,schedule:[{item_id:"item",effective_date:"2026-10-26",total_count:2,reserve_count:1}]};const rows=layoutBoard(scheduled,dates,[booking("a","2026-10-23","2026-10-27"),booking("b","2026-10-23","2026-10-27")]);assert.equal(rows.find(r=>r.kind==="overflow")?.bookings[0].id,"b");});
test("unknown stock remains unconfigured and delivery/return periods are distinct",()=>{const b={...booking("a","2026-10-23","2026-10-28"),start:"2026-10-24",end:"2026-10-27"};const rows=layoutBoard({id:"x",name:"unknown"},dates,[b]);assert.equal(rows[0].kind,"unconfigured");assert.equal(bookingPhase(b,"2026-10-23"),"delivery");assert.equal(bookingPhase(b,"2026-10-24"),"usage");assert.equal(bookingPhase(b,"2026-10-28"),"return");});

test("excessive configured row counts stop instead of rendering an unbounded grid",()=>{assert.throws(()=>layoutBoard({...item,total_count:100000},dates,[]),/多すぎ/);});
