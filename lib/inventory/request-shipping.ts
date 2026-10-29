import{ganttEntry,type InventoryRequest}from'./gantt';
import{transportFromParsed}from'./shipping-record';
import{shippingPlan,type TransportInput}from'./shipping-policy';
export function requestShipping(request:InventoryRequest,app:number){if(![10,49].includes(app))return undefined;const data={...request.parsed_data,...request.approved_contents};const e=ganttEntry({...request,parsed_data:data},app===49?'tezukuru':'allmight');if(!e)return undefined;return{dates:{...e},names:e.items,transport:transportFromParsed(data)??{address:''}as TransportInput};}
export function requestShippingWarnings(input:ReturnType<typeof requestShipping>){return input?[...new Set(input.names.flatMap(name=>shippingPlan({...input.dates,transport:input.transport},name).warnings))]:[];}
