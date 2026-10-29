import type{ImportedEntry}from'./sheet-import';
/** Adjacent monthly source rows may change physical number without becoming another kit. */
export function linkedKitTracks(entries:(ImportedEntry&{source_lane:string})[]){
 const tracks:{itemId:string;segments:{number:number;from:string;to:string}[]}[]=[];
 for(const e of [...entries].sort((a,b)=>a.item_id.localeCompare(b.item_id)||a.start_date.localeCompare(b.start_date)||Number(a.source_lane)-Number(b.source_lane)||a.source_key.localeCompare(b.source_key))){
  const number=Number(e.source_lane);if(!Number.isInteger(number)||number<1)continue;
  let track=tracks.find(t=>t.itemId===e.item_id&&t.segments.some(s=>s.number===number));
  track??=tracks.find(t=>t.itemId===e.item_id&&t.segments.every(s=>s.to<e.start_date||s.from>e.end_date));
  if(!track){track={itemId:e.item_id,segments:[]};tracks.push(track);}
  const prior=track.segments.find(s=>s.number===number);if(prior){prior.from=prior.from<e.start_date?prior.from:e.start_date;prior.to=prior.to>e.end_date?prior.to:e.end_date;}else track.segments.push({number,from:e.start_date,to:e.end_date});
  track.segments.sort((a,b)=>a.from.localeCompare(b.from));
 }
 return tracks;
}
