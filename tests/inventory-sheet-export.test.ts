import {test} from "node:test";
import {strict as assert} from "node:assert";
import {listCsv,ganttCsv,type SheetEntry} from "../lib/inventory/sheet-export";
const e:SheetEntry={product:"JET Cola",staff:"担当",store:"=IMPORTXML(\"bad\")",managementNo:"1010",start:"2026-10-31",end:"2026-11-02",delivery:"2026-10-30",pickup:"2026-11-03",status:"登録完了",quantity:1,requestUrl:"https://example.com/admin/requests/id"};
test("sheet output quotes control strings and publishes only inventory fields",()=>{const csv=listCsv([e]);assert.ok(csv.includes('"1010：=IMPORTXML('));assert.ok(!csv.includes("配送住所"));assert.ok(!csv.includes("メール"));assert.ok(!csv.includes("電話"));});
test("monthly gantt has correct day count and includes events crossing month boundaries",()=>{const oct=ganttCsv([e],"JET Cola","2026-10"),nov=ganttCsv([e],"JET Cola","2026-11");assert.equal(oct.split("\r\n")[0].split(",").length,34);assert.ok(oct.includes("配"));assert.ok(nov.includes("利用"));assert.ok(nov.includes("集"));assert.throws(()=>ganttCsv([e],"JET Cola","2026-13"));});
