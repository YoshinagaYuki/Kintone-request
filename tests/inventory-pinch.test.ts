import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pinchViewport} from '../lib/inventory/pinch';
test('pinch zoom preserves the content point under the fingers in both axes',()=>{
 const view=pinchViewport({distance:100,zoom:100,x:1000,y:300},120,{x:200,y:100});
 assert.deepEqual(view,{zoom:120,left:1000,top:260});
 assert.equal((view.left+200)/(view.zoom/100),1000);
 assert.equal((view.top+100)/(view.zoom/100),300);
});
test('pinch respects the same 50–150% limits as manual controls',()=>{
 const start={distance:100,zoom:100,x:50,y:30};
 assert.equal(pinchViewport(start,10,{x:20,y:20}).zoom,50);
 assert.equal(pinchViewport(start,300,{x:20,y:20}).zoom,150);
 assert.deepEqual(pinchViewport(start,10,{x:200,y:100}),{zoom:50,left:0,top:0});
});
test('pinch starts from the current manual scale, rounds and reverses naturally',()=>{
 const start={distance:100,zoom:80,x:100,y:100};
 assert.equal(pinchViewport(start,125,{x:0,y:0}).zoom,100);
 assert.equal(pinchViewport(start,90,{x:0,y:0}).zoom,72);
 assert.equal(pinchViewport(start,101,{x:0,y:0}).zoom,81);
});
