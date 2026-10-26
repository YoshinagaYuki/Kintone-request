import type{KintoneRecord}from'../kintone/mapper';
export type PreparedRecordUpdate={app:number;id:string;before:KintoneRecord;after:KintoneRecord};
export type SyncIo={get:(app:number,id:string)=>Promise<{record:Record<string,{value:unknown}>;revision:string}>;commit:(records:{app:number;id:string;revision:string;record:KintoneRecord}[])=>Promise<unknown>};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a??'')===JSON.stringify(b??'');
/** Retry safely after a timeout. Never overwrite an external edit to one of the targeted fields. */
export async function syncPreparedUpdates(updates:PreparedRecordUpdate[],io:SyncIo){
 const pending=[];
 for(const u of updates){const current=await io.get(u.app,u.id);const patch:KintoneRecord={};for(const [key,wanted]of Object.entries(u.after)){const actual=current.record[key]?.value;if(equal(actual,wanted.value))continue;if(!equal(actual,u.before[key]?.value))throw Error(`kintone側で対象項目が変更されています（App${u.app}・${key}）。内容を確認してから再試行してください`);patch[key]=wanted;}if(Object.keys(patch).length)pending.push({app:u.app,id:u.id,revision:current.revision,record:patch});}
 if(pending.length)await io.commit(pending);
 for(const u of updates){const current=await io.get(u.app,u.id);for(const [key,wanted]of Object.entries(u.after))if(!equal(current.record[key]?.value,wanted.value))throw Error(`kintone更新後の照合に失敗しました（App${u.app}・${key}）`);}
}
