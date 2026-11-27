/** Only admin routes accept an explicit external contact; public submissions keep their existing policy. */
export function resolveAdminStaff(input:{staff_mode?:unknown;staff_name?:unknown;staff_id?:unknown},members:{id?:string;name:string}[]){
 if(input.staff_mode==='external'){
  const name=typeof input.staff_name==='string'?input.staff_name.trim():'';
  if(!name||name.length>100||/[\u0000-\u001f\u007f]/.test(name))throw Error('外部担当者名を1〜100文字で入力してください');
  return{name,external:true};
 }
 if(input.staff_mode!==undefined&&input.staff_mode!=='master')throw Error('担当者の入力方法を選択してください');
 const matches=members.filter(s=>typeof input.staff_id==='string'&&input.staff_id?s.id===input.staff_id:s.name===input.staff_name);
 if(matches.length!==1)throw Error('担当者マスタから担当者を選択してください');
 return{name:matches[0].name,external:false};
}
