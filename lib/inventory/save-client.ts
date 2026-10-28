export async function postInventorySave(url:string,payload:unknown){
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json();
  if(response.status===409&&data.code==='inventory_stale'&&attempt<2)continue;
  return {response,data};
 }
 throw Error('保存できませんでした。入力内容は残っています。もう一度保存してください');
}
