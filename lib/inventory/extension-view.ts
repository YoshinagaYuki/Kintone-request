import type { InventoryRequest } from "./gantt";
export type ExtensionEdge={parent_request_id:string;child_request_id:string;state:string};
export function extensionView(rows:InventoryRequest[],edges:ExtensionEdge[]):InventoryRequest[] {
  const parents=new Map(rows.filter(r=>r.inventory_parent_request_id).map(r=>[r.id,r.inventory_parent_request_id!]));
  for(const e of edges)parents.set(e.child_request_id,e.parent_request_id);
  const cancelled=new Set(edges.filter(e=>e.state==="complete").map(e=>e.parent_request_id));
  return rows.map(r=>{let root=r.id;const seen=new Set<string>();while(parents.has(root)&&!seen.has(root)){seen.add(root);root=parents.get(root)!;}return {...r,inventory_root_id:root,pickup_cancelled:cancelled.has(r.id)};});
}
