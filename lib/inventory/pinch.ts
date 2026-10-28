/** Keep the point between the fingers stable while scaling the scrollable chart. */
export function pinchViewport(start:{distance:number;zoom:number;x:number;y:number},distance:number,center:{x:number;y:number}){
 const zoom=Math.max(50,Math.min(150,start.zoom*distance/Math.max(1,start.distance)));
 return {zoom,left:Math.max(0,start.x*zoom/100-center.x),top:Math.max(0,start.y*zoom/100-center.y)};
}

/** CSS transforms are applied inside the table's existing CSS zoom. */
export function pinchTransform(start:{zoom:number;x:number;y:number},zoom:number,center:{x:number;y:number},scroll:{left:number;top:number}){
 const base=start.zoom/100;
 const x=(center.x+scroll.left-start.x*zoom/100)/base;
 const y=(center.y+scroll.top-start.y*zoom/100)/base;
 return `translate(${x}px,${y}px) scale(${zoom/start.zoom})`;
}
