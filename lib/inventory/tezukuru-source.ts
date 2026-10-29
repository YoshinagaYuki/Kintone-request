import type{ImportedEntry}from'./sheet-import';
import{TEZUKURU_KITS}from'./business';
import{addDays}from'./gantt';
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

/** Interpret source-only transport notes without rewriting the archived spreadsheet cells.
 * A marker joins only one adjacent event on the same numbered row; ambiguous notes stay blocked.
 */
export function normalizeKitSourceEntries(entries:(ImportedEntry&{source_lane:string})[]){
 const rows=entries.map(e=>({...e})),consumed=new Set<string>();
 const transport=(s:string)=>/^(?:納品(?:希望|予定)|集荷(?:希望|予定|→))$/.test(s.normalize('NFKC').trim());
 const blocked=(s:string)=>/^(?:貸出不可|使用不可|予備)$/.test(s)||/中\d+日$/.test(s);
 for(const note of rows){
  if(!TEZUKURU_KITS.includes(note.source_tab as any))continue;
  const materialCount=note.store_name.normalize('NFKC').match(/通常版(\d+)/)?.[1];if(materialCount&&note.management_no===materialCount)note.management_no='';
  if(blocked(note.store_name)){note.state='blocked';continue;}
  if(!transport(note.store_name))continue;
  note.state='blocked';if(!note.source_lane)continue;
  const delivery=/^納品/.test(note.store_name);
  const nearby=rows.filter(e=>e!==note&&e.state!=='skipped'&&e.state!=='blocked'&&!transport(e.store_name)&&!blocked(e.store_name)&&e.source_tab===note.source_tab&&e.source_lane===note.source_lane&&(delivery?addDays(note.end_date,1)===e.start_date:addDays(e.end_date,1)===note.start_date));
  if(nearby.length!==1)continue;
  const target=nearby[0];let raw:Record<string,unknown>={};try{raw=JSON.parse(target.source_raw??'{}')}catch{}
  raw[delivery?'delivery':'pickup']=delivery?note.end_date:note.start_date;
  raw.transportNotes=[...(Array.isArray(raw.transportNotes)?raw.transportNotes:[]),{cell:note.source_cell,text:note.store_name}];
  target.start_date=target.start_date<note.start_date?target.start_date:note.start_date;target.end_date=target.end_date>note.end_date?target.end_date:note.end_date;
  target.source_cell=[target.source_cell,note.source_cell].join(',');target.source_raw=JSON.stringify(raw);consumed.add(note.source_key);
 }
 return rows.filter(e=>!consumed.has(e.source_key));
}
