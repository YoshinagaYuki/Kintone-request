/** Plain addresses only; never interpret display names or mail header syntax. */
export const MAX_RECIPIENTS=20;
export const MAX_RECIPIENT_INPUT=6000;
export function parseEmailRecipients(input:string):{ok:true;emails:string[];value:string}|{ok:false;error:string}{
 if(input.length>MAX_RECIPIENT_INPUT)return{ok:false,error:'メールアドレスの入力が長すぎます。20件以内で入力してください。'};
 if(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(input))return{ok:false,error:'メールアドレスに使用できない文字が含まれています。'};
 const parts=input.split(/[,，、;；\r\n]+/).map(v=>v.trim()).filter(Boolean);
 if(!parts.length)return{ok:false,error:'入力者メールアドレスを入力してください。'};
 const emails:string[]=[],seen=new Set<string>();
 for(const [i,email]of parts.entries()){
  if(email.length>254||!/^[^\s@<>()\[\]:,;"\\]+@[^\s@<>()\[\]:,;"\\]+\.[^\s@<>()\[\]:,;"\\]+$/.test(email))return{ok:false,error:`${i+1}件目のメールアドレスの形式が正しくありません。`};
  const key=email.toLowerCase();if(!seen.has(key)){seen.add(key);emails.push(email);}
 }
 if(emails.length>MAX_RECIPIENTS)return{ok:false,error:'メールアドレスは20件以内で入力してください。'};
 return{ok:true,emails,value:emails.join(', ')};
}
