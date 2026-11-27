import type {InventoryModel,InventoryRecord} from './model';
import {availableAutomaticNumbers,automaticPackingScore,resolveUnitNumber,unitNumber,validateNumber} from './operations';
/** Prefer one consecutive block for the same item in a new case; never move existing or manual assignments. */
export function assignBatchUnits(model:InventoryModel,records:InventoryRecord[],choices:unknown[],existing=model.records){
 if(records.length!==choices.length)throw Error('台数と機器番号を確認してください');
 // A retry after a lost response must retain the already-saved units for these deterministic hold keys.
 choices=choices.map((choice,i)=>{const prior=existing.find(r=>r.itemId===records[i].itemId&&r.booking.key===records[i].booking.key);return choice==='auto'&&prior?prior.booking.unitNumber??null:choice;});
 const result=records.map((r,i)=>({...r,booking:{...r.booking,unitNumber:choices[i]==='auto'?null:unitNumber(choices[i])}}));
 const assigned=new Set<number>();result.forEach((r,i)=>{if(choices[i]!=='auto'){validateNumber(model,r,r.booking.unitNumber);assigned.add(i);}});
 const groups=new Map<string,number[]>();result.forEach((r,i)=>groups.set(r.itemId,[...(groups.get(r.itemId)??[]),i]));
 const reserved=()=>[...existing,...[...assigned].map(i=>result[i])];
 for(const indexes of groups.values()){
  const auto=indexes.filter(i=>choices[i]==='auto');if(!auto.length)continue;
  const fixed=indexes.filter(i=>assigned.has(i)&&result[i].booking.unitNumber!==null).map(i=>result[i].booking.unitNumber!);
  const width=auto.length+fixed.length,available=new Map(auto.map(i=>[i,new Set(availableAutomaticNumbers(model,result[i],reserved()))]));
  let best:{numbers:number[];score:number}|null=null;
  if(new Set(fixed).size===fixed.length)for(let start=1;start+width-1<=250;start++){
   if(fixed.some(n=>n<start||n>=start+width))continue;
   const numbers=Array.from({length:width},(_,j)=>start+j).filter(n=>!fixed.includes(n));
   if(numbers.some((n,j)=>!available.get(auto[j])!.has(n)))continue;
   const score=numbers.reduce((sum,n,j)=>sum+automaticPackingScore(model,result[auto[j]],n,reserved()),0);
   if(!best||score<best.score)best={numbers,score};
  }
  if(best){auto.forEach((i,j)=>{result[i].booking.unitNumber=best!.numbers[j];assigned.add(i);});}
  else for(const i of auto){result[i].booking.unitNumber=resolveUnitNumber(model,result[i],'auto',reserved());assigned.add(i);}
 }
 return result;
}
