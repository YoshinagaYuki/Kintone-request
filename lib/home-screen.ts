export const HOME_PAGES = [
 {path:'/admin/inventory/allmight',label:'オールマイト在庫'},
 {path:'/admin/inventory/tezukuru',label:'てずくーる!!在庫'},
 {path:'/admin/requests',label:'申請一覧'},
 {path:'/admin/plans',label:'レンタルプラン'},
 {path:'/admin/items',label:'商品マスタ'},
 {path:'/admin/staff',label:'担当者'},
] as const;
export function homePage(value:unknown):string{return HOME_PAGES.some(p=>p.path===value)?String(value):'/admin/requests';}
export function legacyHomeRedirect({standalone,path,search,preferred}:{standalone:boolean;path:string;search:string;preferred:unknown}):string|null{
 const target=homePage(preferred);
 return standalone&&path==='/admin/requests'&&!search&&target!==path?target:null;
}
