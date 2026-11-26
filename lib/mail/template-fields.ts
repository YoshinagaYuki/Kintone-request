import {driveToken,type DriveLink} from './drive-links';
export const emailFields=[
 {key:'applicant_name',label:'申請者名',example:'山田 太郎'},
 {key:'management_no',label:'管理番号',example:'1234'},
 {key:'form_type_name',label:'申請種別',example:'レンタル'},
 {key:'booth_name',label:'会場・店舗名',example:'○○店 イベント会場'},
 {key:'agency_name',label:'企業・取次店名',example:'株式会社○○'},
 {key:'submitted_at',label:'申請日時',example:'2026/11/26 12:00'},
 {key:'approved_at',label:'本登録日時',example:'2026/11/26 15:00'},
 {key:'order_details',label:'申請内容の一覧',example:'利用期間：12/5〜12/6\nレンタル内容・数量・配送先・集荷先などが入ります。'},
 {key:'manual_drive_url',label:'ドライブの資料リンク',example:'（選択した事業のドライブURL）'},
] as const;
const fields=(links:DriveLink[])=>[...emailFields.filter(f=>f.key!=='manual_drive_url'||!links.some(l=>l.id==='legacy')),...links.map(l=>({key:driveToken(l.id),label:`資料：${l.name}`,example:l.url}))];
export function readableTemplate(value:string,links:DriveLink[]=[]){return fields(links).reduce((text,f)=>text.replace(new RegExp('\\{\\{\\s*'+f.key+'\\s*\\}\\}','g'),`【${f.label}】`),value);}
export function storedTemplate(value:string,links:DriveLink[]=[]){return fields(links).reduce((text,f)=>text.split(`【${f.label}】`).join(`{{${f.key}}}`),value);}
export function previewTemplate(value:string,business:'allmight'|'tezukuru',drive:string,links:DriveLink[]=[]){const vars=Object.fromEntries(fields(links).map(f=>[f.key,f.key==='form_type_name'?business==='allmight'?'オールマイト':'てずくーる':f.key==='manual_drive_url'?drive||'（ドライブURLが未設定です）':f.example]));return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g,(_,key:string)=>vars[key]??'');}
