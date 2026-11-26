import type {InventoryRecord, BookingEdit} from './model';
import type {BoardBooking} from './board';
export const holdPhases = {hold:'仮押さえ', waiting_shipping:'配送情報待ち', shipping_entered:'本登録'} as const;
export type HoldPhase = keyof typeof holdPhases;
export function isHoldPhase(value:unknown):value is HoldPhase{return typeof value==='string' && Object.hasOwn(holdPhases,value);}
/** Registration age is immutable: editing a schedule or memo never restarts the clock. */
export function withHoldWorkflows(records:InventoryRecord[],edits:BookingEdit[]):InventoryRecord[]{
 const patches=new Map(edits.map(e=>[e.booking_key,e.patch]));
 const phases=new Map<string,{phase:HoldPhase;version:number}>();
 for(const r of records){const patch=patches.get(r.booking.key??'');if(!patch)continue;const shared=patch.bundleCommon as Record<string,unknown>|undefined;
  for(const p of [patch,shared]){if(!p||!isHoldPhase(p.holdPhase))continue;const version=typeof p.holdPhaseVersion==='number'?p.holdPhaseVersion:0,key=r.booking.bundleKey??r.booking.key!;const prior=phases.get(key);if(!prior||version>prior.version)phases.set(key,{phase:p.holdPhase,version});}
 }
 return records.map(r=>({...r,booking:{...r.booking,holdPhase:phases.get(r.booking.bundleKey??r.booking.key!)?.phase}}));
}
export function holdWorkflow(bookings:BoardBooking[],now=Date.now()){
 const phase=bookings.map(b=>b.holdPhase).find(isHoldPhase)??'hold';
 const times=bookings.map(b=>Date.parse(b.holdCreatedAt??'')).filter(Number.isFinite);
 const opened=times.length?Math.min(...times):null;
 const due=opened===null?null:opened+14*86400000;
 return {phase,label:holdPhases[phase],opened,due,overdue:bookings.length>0&&bookings.every(b=>b.status==='hold')&&phase==='hold'&&due!==null&&now>=due};
}

/** Dates alone are generated automatically and are not proof that shipping details were entered. */
export function shippingInformationEntered(data:Record<string,unknown>,deliveryRequired=true,pickupRequired=true){
 const filled=(keys:string[])=>keys.every(k=>typeof data[k]==='string'&&(data[k] as string).trim().length>0);
 return (!deliveryRequired||filled(['配送住所','当日受領者氏名','配送連絡先']))&&(!pickupRequired||filled(['集荷住所','当日引渡者氏名','集荷連絡先']));
}

export function holdWorkflowKeys(records:InventoryRecord[]){return [...new Set(records.flatMap(r=>[r.booking.key!,...(r.booking.monthlySourceKeys??[])]))];}
