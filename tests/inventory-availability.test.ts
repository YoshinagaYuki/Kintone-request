import { strict as assert } from "node:assert";
import { test } from "node:test";
import { capacityOn, matchCapacityItem } from "../lib/inventory/availability";
const item={id:"i",name:"JET Cola",aliases:["JETコーラ"],total_count:5,reserve_count:1};
test("capacity includes boundary dates, reserve and multiple quantities; unknown differs from zero",()=>{const bookings=[{item_id:"i",from:"2026-10-23",to:"2026-10-25",quantity:3},{item_id:"i",from:"2026-10-25",to:"2026-10-26",quantity:2}];assert.equal(capacityOn("2026-10-25",item,bookings).remaining,-1);assert.equal(capacityOn("2026-10-27",item,bookings).remaining,4);assert.equal(capacityOn("2026-10-25",{id:"i",name:"x"},bookings).remaining,null);assert.equal(capacityOn("2026-10-27",{...item,total_count:0,reserve_count:0},bookings).remaining,0);});
test("matching accepts unique known aliases and refuses ambiguous or fuzzy names",()=>{assert.equal(matchCapacityItem("JETコーラ",[item])?.id,"i");assert.equal(matchCapacityItem("JETコーラ",[item,{id:"other",name:"Other",aliases:["JETコーラ"]}]),null);assert.equal(matchCapacityItem("JET",[item]),null);});
