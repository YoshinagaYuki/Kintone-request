import type {InventoryModel,InventoryRecord} from './model';
/** A registered system request is authoritative over an old manually linked/imported row of the same invoice. */
export function canonicalCopySource(model:Pick<InventoryModel,'records'>,source:InventoryRecord){
 if(source.deleted)throw Error('削除済みの予定はコピーできません');
 if(source.booking.kind==='request'||!source.booking.managementNo)return source;
 const records=model.records.filter(r=>!r.deleted&&r.booking.kind==='request'&&r.booking.status==='registered'&&r.booking.managementNo===source.booking.managementNo);
 if(!records.length)return source;
 const ids=new Set(records.map(r=>r.booking.id));if(ids.size!==1)throw Error('同じ管理番号の本登録が複数あります。コピー元を確認してください');
 const matching=records.filter(r=>r.itemId===source.itemId&&r.booking.start===source.booking.start&&r.booking.end===source.booking.end).sort((a,b)=>(a.booking.key??'').localeCompare(b.booking.key??''));
 if(!matching.length)throw Error('旧予定と本登録の日程・商品が一致しません。本登録の予定からコピーしてください');
 return matching[0];
}
