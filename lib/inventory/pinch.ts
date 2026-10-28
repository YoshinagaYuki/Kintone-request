/** Keep the point between the fingers stable while scaling the scrollable chart. */
export function pinchViewport(start:{distance:number;zoom:number;x:number;y:number},distance:number,center:{x:number;y:number}){
 const zoom=Math.max(50,Math.min(150,Math.round(start.zoom*distance/Math.max(1,start.distance))));
 return {zoom,left:Math.max(0,start.x*zoom/100-center.x),top:Math.max(0,start.y*zoom/100-center.y)};
}
