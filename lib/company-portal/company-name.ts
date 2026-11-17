/** Conservative identity matching: legal-form/space variations plus explicitly approved aliases only. */
export function companyKey(value:string){
 let key=value.normalize('NFKC').toLowerCase().replace(/[\s\u3000]/g,'');
 key=key.replace(/^(?:(?:株式会社|\(株\)))+/,'').replace(/(?:(?:株式会社|\(株\)))+$/,'');
 return key==='unity'?'ユニティ':key;
}
export function companyName(data:Record<string,unknown>){return String(data['企業名']||data['取次店名']||'').trim();}
export function approvedCompanyName(data:Record<string,unknown>,value:unknown){
 if(value===undefined)return data;
 if(typeof value!=='string'||value.trim().length>200||/[\x00-\x1f\x7f]/.test(value))throw Error('企業名は200文字以内で入力してください');
 const name=value.trim();return {...data,'企業名':name,'取次店名':name};
}
