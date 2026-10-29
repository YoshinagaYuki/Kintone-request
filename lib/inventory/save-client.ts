export async function postInventorySave(url:string,payload:unknown){
 let body=payload;
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(response.status===409&&data.code==='shipping_warning'&&attempt<3){if(!window.confirm(data.error))return{response,data:{...data,error:'保存を見送りました。入力内容は残っています。'}};body={...(body as Record<string,unknown>),shipping_ack:data.warningKey};continue;}
  if(response.status===409&&data.code==='inventory_stale'&&attempt<2)continue;
  return {response,data};
 }
 throw Error('保存できませんでした。入力内容は残っています。もう一度保存してください');
}
