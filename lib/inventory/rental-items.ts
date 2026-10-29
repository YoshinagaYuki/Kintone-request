/** Physical rental kit lines are independent from material product quantities. */
export type RentalItemChoice={id:string;name:string;is_active?:boolean;aliases?:unknown};
export type RentalItemLine={item_id:string;name:string;quantity:number};
export function validateRentalItems(input:unknown,catalog:RentalItemChoice[],allowEmpty=false):RentalItemLine[]{
 if(!Array.isArray(input)||input.length>5)throw Error('レンタル品は5種類・合計5台まで選択してください');
 const lines:RentalItemLine[]=[];
 for(const value of input){if(!value||typeof value!=='object')throw Error('レンタル品を選択してください');const item=catalog.find(i=>i.id===value.item_id&&i.is_active!==false);if(!item)throw Error('選択したレンタル品は削除または変更されています。選び直してください');if(!Number.isInteger(value.quantity)||value.quantity<1||value.quantity>5)throw Error('レンタル品の台数は1〜5台で入力してください');const existing=lines.find(l=>l.item_id===item.id);if(existing)existing.quantity+=value.quantity;else lines.push({item_id:item.id,name:item.name,quantity:value.quantity});}
 const count=lines.reduce((n,l)=>n+l.quantity,0);if(count>5||(!allowEmpty&&!count))throw Error('レンタル品を合計1〜5台で選択してください');return lines;
}
export function rentalMetadata(lines:RentalItemLine[]){return{_inventory_rental_items:lines,['レンタル品一覧']:rentalSummary(lines),_inventory_kit_names:lines.flatMap(l=>Array.from({length:l.quantity},()=>l.name))};}
export function savedRentalItems(data:Record<string,unknown>,catalog:RentalItemChoice[]):RentalItemLine[]{
 if(!Array.isArray(data._inventory_rental_items))return[];
 return data._inventory_rental_items.filter((l:any)=>l&&typeof l.item_id==='string'&&Number.isInteger(l.quantity)&&l.quantity>0&&l.quantity<=5).map((l:any)=>({...l,name:catalog.find(i=>i.id===l.item_id)?.name??l.name??'削除済みレンタル品'}));
}
export function rentalSummary(lines:RentalItemLine[]){return lines.map(l=>`${l.name} × ${l.quantity}台`).join(' ／ ');}
export function rentalNote(existing:string,summary:string){const clean=existing.replace(/\n?\[レンタル品\][\s\S]*?\[\/レンタル品\]/g,'').trim();return[clean,summary?`[レンタル品]\n${summary}\n[/レンタル品]`:''].filter(Boolean).join('\n');}
