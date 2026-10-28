export const MOBILE_DAY=46,MOBILE_LABEL=120,MOBILE_LANE=60;
export function mobileWindow({left,top,width,height,scale,dates,lanes,header}:{left:number;top:number;width:number;height:number;scale:number;dates:number;lanes:number;header:number}){
 return {firstDay:Math.max(0,Math.floor(left/scale/MOBILE_DAY)-1),lastDay:Math.min(dates-1,Math.ceil((left+width)/scale/MOBILE_DAY)),firstLane:Math.max(0,Math.floor((top/scale-header)/MOBILE_LANE)),lastLane:Math.min(lanes-1,Math.ceil(((top+height)/scale-header)/MOBILE_LANE))};
}
export function mobileHit(x:number,y:number,left:number,top:number,scale:number,header:number,dates:number,lanes:number){
 if(x<MOBILE_LABEL*scale||y<header*scale)return null;
 const day=Math.floor(((left+x)/scale-MOBILE_LABEL)/MOBILE_DAY),lane=Math.floor(((top+y)/scale-header)/MOBILE_LANE);
 return day>=0&&day<dates&&lane>=0&&lane<lanes?{day,lane}:null;
}
