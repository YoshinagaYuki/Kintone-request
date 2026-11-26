export type DriveLink={id:string;name:string;url:string};
export type DriveLibraries=Record<'allmight'|'tezukuru',DriveLink[]>;
export const driveSettingKey=(business:'allmight'|'tezukuru')=>`mail_drive_links_${business}`;
export const driveToken=(id:string)=>id==='legacy'?'manual_drive_url':`drive_${id}`;
export function validateDriveLinks(value:unknown):DriveLink[]{
 if(!Array.isArray(value)||value.length>30)throw Error('資料リンクは事業ごとに30件まで登録できます');
 const ids=new Set<string>(),names=new Set<string>();
 return value.map(row=>{
  if(!row||typeof row!=='object')throw Error('資料リンクの内容を確認してください');
  const {id,name,url}=row;
  if(typeof id!=='string'||!(/^[a-z0-9_]{1,64}$/).test(id)||ids.has(id))throw Error('資料リンクの識別情報が不正です');
  if(typeof name!=='string'||!name.trim()||name.trim().length>80||/[【】\r\n{}]/.test(name)||names.has(name.trim()))throw Error('資料名は重複しない80文字以内の名前にしてください');
  if(typeof url!=='string'||url.length>2048||/[\s\x00-\x1f]/.test(url))throw Error('資料の共有URLを確認してください');
  try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error();}catch{throw Error('資料の共有URLは http:// または https:// で始まる正しいURLにしてください');}
  ids.add(id);names.add(name.trim());return{id,name:name.trim(),url:url.trim()};
 });
}
export function driveLibrary(value:string|undefined,legacy:string):DriveLink[]{
 if(value!==undefined){try{return validateDriveLinks(JSON.parse(value));}catch{throw Error('資料リンクの設定を読み込めません。システム設定を確認してください');}}
 return legacy?[{id:'legacy',name:'当日運営資料・取扱説明書',url:legacy}]:[];
}
export function driveVariables(links:DriveLink[]){return Object.fromEntries(links.map(l=>[driveToken(l.id),l.url]));}
