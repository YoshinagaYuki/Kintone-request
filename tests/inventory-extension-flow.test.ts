import { strict as assert } from "node:assert";
import { test } from "node:test";
import { executeExtension, type ExtensionPorts, type ExtensionPlan, type Progress } from "../lib/inventory/extensions/flow";
import { extensionInput, extensionParsed, extensionDraft } from "../lib/inventory/extensions/model";
import type { KintoneRawRecord } from "../lib/kintone/client";
const childId="11111111-1111-4111-8111-111111111111";
function fixture(){
  const records=new Map<string,KintoneRawRecord>();
  records.set("10:old",{$id:{value:"old"},$revision:{value:"1"},"管理番号":{value:"100"},"日付_1":{value:"2026-10-25"},"集荷_日付":{value:"2026-10-26"},"集荷_手配種別":{value:"通常配送"}});
  records.set("11:oldshipping",{$id:{value:"oldshipping"},$revision:{value:"1"},"管理番号":{value:"100"},"集荷_日付":{value:"2026-10-26"},"集荷_手配種別":{value:"通常配送"}});
  const calls:string[]=[];let progress:Progress={};let creates=0,numbers=0;let failAt="";let lostCreate=false;
  const ports:ExtensionPorts={
    async checkpoint(p){progress=structuredClone(p);},
    async find(app,k,v){return [...records.entries()].filter(([key,r])=>key.startsWith(`${app}:`)&&String(r[k]?.value??"")===v).map(([,r])=>structuredClone(r));},
    async get(app,id){const r=records.get(`${app}:${id}`);if(!r)throw new Error("not found");return structuredClone(r);},
    async create(app,r){const id=`new${++creates}`;records.set(`${app}:${id}`,{...structuredClone(r),$id:{value:id},$revision:{value:"1"}});calls.push(`create:${app}`);if(lostCreate){lostCreate=false;throw new Error("response lost");}return id;},
    async update(app,id,fields,revision){calls.push(`update:${app}:${id}:${Object.keys(fields).join(",")}`);if(failAt===`${app}:${id}`){failAt="";throw new Error("temporary failure");}const r=records.get(`${app}:${id}`)!;assert.equal(r.$revision.value,revision);Object.assign(r,structuredClone(fields));r.$revision={value:String(Number(revision)+1)};},
    async issueNumber(){numbers++;return "101";},async saveIdentity(){},definitelyRejected:()=>false,
  };
  const plan:ExtensionPlan={childId,parentRecordId:"old",parentNumber:"100",parentUsageEnd:"2026-10-25",parentPickupDate:"2026-10-26",pickupDate:"2026-11-02",draft:{external_project_id:{value:`inventory-extension:${childId}`},"手配種別":{value:"手配不要"},"集荷_手配種別":{value:"手配不要"}},progress:{}};
  return {ports,plan,records,calls,get progress(){return progress;},get creates(){return creates;},get numbers(){return numbers;},set failAt(s:string){failAt=s;},set lostCreate(b:boolean){lostCreate=b;}};
}
test("extension prepares both drafts, cancels old pickup, then activates new pickup; rerun does not duplicate",async()=>{const f=fixture();const result=await executeExtension(f.plan,f.ports);assert.equal(result.managementNo,"101");const cancel=f.calls.findIndex(c=>c.startsWith("update:10:old:"));assert.ok(f.calls.indexOf("create:11")<cancel);assert.equal(f.records.get("10:old")!["集荷_手配種別"].value,"手配不要");assert.equal(f.records.get(`11:${result.shippingId}`)!["集荷_手配種別"].value,"通常配送");await executeExtension({...f.plan,progress:f.progress},f.ports);assert.equal(f.creates,2);assert.equal(f.numbers,1);});
test("failure after old cancellation is recoverable without a second record or number",async()=>{const f=fixture();f.failAt="11:oldshipping";await assert.rejects(executeExtension(f.plan,f.ports),/temporary/);assert.equal(f.records.get("11:new2")!["集荷_手配種別"].value,"手配不要");await executeExtension({...f.plan,progress:f.progress},f.ports);assert.equal(f.creates,2);assert.equal(f.numbers,1);});
test("lost create response reconciles by marker; unresolved ambiguous writes never blindly create again",async()=>{const f=fixture();f.lostCreate=true;await assert.rejects(executeExtension(f.plan,f.ports),/response lost/);await executeExtension({...f.plan,progress:f.progress},f.ports);assert.equal(f.creates,2);const g=fixture();await assert.rejects(executeExtension({...g.plan,progress:{recordAttempted:true}},g.ports),/結果が不明/);assert.equal(g.creates,0);});
test("changed source date stops before cancelling any old pickup",async()=>{const f=fixture();f.records.get("10:old")!["集荷_日付"]={value:"2026-10-27"};await assert.rejects(executeExtension(f.plan,f.ports),/変更されています/);assert.equal(f.records.get("10:old")!["集荷_手配種別"].value,"通常配送");});
test("new extension clears all shipping contacts and dates, keeps selected pickup date and charges only extension usage",()=>{const input=extensionInput({id:childId,usage_end:"2026-11-01",pickup_date:"2026-11-02",billing_month:11});const parsed=extensionParsed({"利用最終日":"2026-10-25","配送住所":"old address","配送日付":"2026-10-20","集荷住所":"old address","機器商品①":"JET Cola"},input);assert.equal(parsed["利用開始日"],"2026-10-26");assert.equal("配送住所" in parsed,false);assert.equal("集荷住所" in parsed,false);const record=extensionDraft(parsed,{mappings:[{fmt_label:"機器商品①",kintone_code:"レンタル機材",kintone_type:"DROP_DOWN"},{fmt_label:"利用開始日",kintone_code:"日付_0",kintone_type:"DATE",required:true},{fmt_label:"利用最終日",kintone_code:"日付_1",kintone_type:"DATE",required:true},{fmt_label:"配送日付",kintone_code:"納品_日付",kintone_type:"DATE",required:true}]},childId,"100");assert.equal(record["納品_日付"].value,"");assert.equal(record["集荷_住所"].value,"");assert.equal(record["集荷_日付"].value,"2026-11-02");assert.equal(record["手配種別"].value,"手配不要");assert.equal(record["利用日数"].value,"7");});
