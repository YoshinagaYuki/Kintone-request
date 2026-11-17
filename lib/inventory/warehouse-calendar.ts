import holidays from './japan-holidays.json';
import {addDays,validDate} from './gantt';
export type WarehouseClosure={id:string;start_date:string;end_date:string;name:string};
export const HOLIDAY_SOURCE='https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html';
export const HOLIDAY_LAST_YEAR=Math.max(...Object.keys(holidays).map(d=>Number(d.slice(0,4))));
export function warehouseClosed(date:string,closures:WarehouseClosure[]=[]){
 if(!validDate(date))return false;
 const weekday=new Date(`${date}T00:00:00Z`).getUTCDay();
 return weekday===0||weekday===6||!!(holidays as Record<string,string>)[date]||closures.some(c=>c.start_date<=date&&date<=c.end_date);
}
export function warehouseDayReason(date:string,closures:WarehouseClosure[]=[]){return closures.find(c=>c.start_date<=date&&date<=c.end_date)?.name||(holidays as Record<string,string>)[date]||([0,6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())?'土日休業':'営業日');}
/** No finite list of closed ranges may silently trap the dispatch search. */
export function warehouseOpenDay(date:string,direction:-1|1,closures:WarehouseClosure[]=[],carrierClosed:(d:string)=>boolean=()=>false){
 if(!validDate(date))return date;
 let result=date;for(let i=0;i<3660;i++){if(!warehouseClosed(result,closures)&&!carrierClosed(result))return result;result=addDays(result,direction);}throw Error('発送可能な倉庫営業日が見つかりません。休業日の設定を確認してください');
}
