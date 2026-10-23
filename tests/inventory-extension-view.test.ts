import {test} from "node:test";
import {strict as assert} from "node:assert";
import {extensionView} from "../lib/inventory/extension-view";
import {ganttEntry,type InventoryRequest} from "../lib/inventory/gantt";
import {capacityOn} from "../lib/inventory/availability";
const base:InventoryRequest={id:"root",status:"registered",management_no:"100",parsed_data:{"利用開始日":"2026-10-20","利用最終日":"2026-10-25","集荷日付":"2026-10-26","機器商品①":"JET Cola"},approved_staff_name:null,company_staff_name_input:null};
test("completed extension hides superseded pickup and shares physical stock identity across chained extensions",()=>{const rows=extensionView([base,{...base,id:"child",inventory_parent_request_id:"root"}], [{parent_request_id:"root",child_request_id:"child",state:"complete"}]);assert.equal(ganttEntry(rows[0])?.pickup,"");assert.equal(rows[1].inventory_root_id,"root");assert.equal(capacityOn("2026-10-25",{id:"JET",name:"JET Cola",total_count:5,reserve_count:1},[{item_id:"JET",from:"2026-10-20",to:"2026-10-26",quantity:1,group:"root:0"},{item_id:"JET",from:"2026-10-25",to:"2026-11-01",quantity:1,group:"root:0"}]).used,1);});
