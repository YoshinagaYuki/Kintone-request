export const MASTER_PAGES=[{href:'/admin/plans',label:'レンタルプラン'},{href:'/admin/rental-items',label:'レンタル品マスタ'},{href:'/admin/items',label:'商品マスタ'}]as const;
export const SETTINGS_PAGES=[{href:'/admin/email-templates',label:'メールテンプレート'},{href:'/admin/settings',label:'システム設定'},{href:'/admin/home-screen',label:'ホーム画面の設定'},{href:'/admin/admin-users',label:'管理者'}]as const;
export function adminSection(path:string){return MASTER_PAGES.some(p=>path===p.href||path.startsWith(p.href+'/'))?'master':SETTINGS_PAGES.some(p=>path===p.href||path.startsWith(p.href+'/'))?'settings':null;}
