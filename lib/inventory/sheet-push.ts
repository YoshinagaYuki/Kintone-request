import 'server-only';
import {after} from 'next/server';
import {createHmac,randomBytes} from 'node:crypto';
/** No-op until the owner authorizes and configures the Google writer. No customer data in the hook. */
export function scheduleInventorySheetPush(){
 const url=process.env.INVENTORY_SHEETS_PUSH_URL,key=process.env.INVENTORY_SHEETS_PUSH_KEY;
 if(!url||!key||key.length<32||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))return;
 after(async()=>{
  for(let attempt=0;attempt<2;attempt++){
   const timestamp=Date.now(),nonce=randomBytes(16).toString('hex');
   const signature=createHmac('sha256',key).update(`${timestamp}:${nonce}`).digest('hex');
   try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp,nonce,signature}),signal:AbortSignal.timeout(25000),cache:'no-store'});if(response.ok&&(await response.json()).ok===true)return;}catch{/* The Google minute trigger reconciles missed pushes. */}
  }
  console.error('Inventory sheet push failed; reconciliation required');
 });
}

export function withInventorySheetPush<A extends unknown[]>(handler:(...args:A)=>Promise<Response>){
 return async(...args:A)=>{const response=await handler(...args);if(response.ok)scheduleInventorySheetPush();return response;};
}
