import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rankCandidates, type HoldCandidate } from "../lib/inventory/matching";
const h: HoldCandidate={id:"h1",item_id:"i1",item_name:"JET Cola",staff_name:"吉永",store_name:"店舗A",start_date:"2026-10-23",end_date:"2026-10-25",quantity:1};
const r={start:"2026-10-23",end:"2026-10-25",staff:"吉永",store:"店舗A",items:["JET Cola"]};
test("date shifts within seven days remain candidates, far and invalid dates do not",()=>{assert.equal(rankCandidates([{...h,start_date:"2026-10-30",end_date:"2026-11-01"}],r).length,1);assert.equal(rankCandidates([{...h,start_date:"2026-10-31"}],r).length,0);assert.equal(rankCandidates([h],{...r,start:"2026-02-30"}).length,0);});
test("staff/store/item agreement outranks date-only similarity; results never auto-select",()=>{const a=rankCandidates([{...h,id:"h2",staff_name:"別担当",store_name:"別店舗"},h],r);assert.equal(a[0].id,"h1");assert.equal("selected" in a[0],false);});
