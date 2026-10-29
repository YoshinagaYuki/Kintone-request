import{addDays,validDate}from'./gantt';
export type ShippingRange={delivery:string;pickup:string};
export function chooseRange(previous:ShippingRange,date:string):ShippingRange{
 if(!validDate(date))return previous;
 if(!previous.delivery||previous.pickup||date<previous.delivery)return{delivery:date,pickup:''};
 return{delivery:previous.delivery,pickup:date};
}
export function monthCells(month:string):(string|null)[]{
 const d=new Date(`${month}-01T00:00:00Z`);if(!Number.isFinite(d.getTime()))return[];
 const prefix=d.getUTCDay(),length=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 return [...Array.from({length:prefix},()=>null),...Array.from({length},(_,i)=>addDays(`${month}-01`,i))];
}
export function rangeError(range:ShippingRange){
 if(!validDate(range.delivery)||!validDate(range.pickup))return'配送日と集荷日を選択してください';
 if(range.delivery<'2000-01-01'||range.pickup>'2100-12-31')return'2000〜2100年の日付を選んでください';
 if(range.pickup<addDays(range.delivery,2))return'利用日を1日以上確保するため、集荷日は配送日の2日後以降にしてください';
 return'';
}
