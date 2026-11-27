export const RENTAL_REQUIRED_CC='y-yoshinaga@unity-corp.jp';
export function assignedStaffRecipient(name:string,staff:{name:string;email:string|null;is_active?:boolean;email_notify_enabled?:boolean}[]){
 const matches=staff.filter(s=>s.is_active!==false&&s.name.trim()===name.trim());
 if(!name.trim()||matches.length!==1)throw Error('弊社担当者氏名を担当者マスタの1名に特定できません');
 const email=(matches[0].email??'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('担当者マスタのメールアドレスが未登録・不正です');
 return email;
}
