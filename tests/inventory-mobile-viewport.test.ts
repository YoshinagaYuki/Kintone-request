import {test} from 'node:test';import assert from 'node:assert/strict';
import {mobileWindow,mobileHit} from '../lib/inventory/mobile-viewport';
test('mobile rendering is bounded by the viewport, even for12 months and250 lanes',()=>{
 const view=mobileWindow({left:5000,top:5000,width:390,height:506,scale:.5,dates:365,lanes:250,header:76});
 assert.ok((view.lastDay-view.firstDay+1)*(view.lastLane-view.firstLane+1)<500);
 assert.ok(view.firstLane>0);assert.ok(view.lastDay<365);
});
test('tap coordinates stay attached to the equipment and date after zoom and both scroll axes',()=>{
 assert.deepEqual(mobileHit(170,100,46*10,60*3,1,76,365,25),{day:11,lane:3});
 assert.deepEqual(mobileHit(255,150,46*10*1.5,60*3*1.5,1.5,76,365,25),{day:11,lane:3});
 assert.equal(mobileHit(110,100,0,0,1,76,365,25),null);
 assert.equal(mobileHit(170,60,0,0,1,76,365,25),null);
 assert.equal(mobileHit(170,5000,0,0,1,76,365,25),null);
});
test('frozen header and first lane account for scaled vertical scroll and screen-balance row',()=>{
 const v=mobileWindow({left:0,top:240,width:390,height:300,scale:2,dates:10,lanes:25,header:76});
 assert.equal(v.firstLane,0);assert.equal(v.lastLane,4);
 assert.equal(mobileWindow({left:0,top:0,width:390,height:300,scale:1,dates:0,lanes:0,header:56}).lastLane,-1);
});
