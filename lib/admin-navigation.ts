export const MASTER_PAGES=[{href:'/admin/plans',label:'レンタルプラン'},{href:'/admin/rental-items',label:'レンタル品マスタ'},{href:'/admin/items',label:'商品マスタ'}]as const;
export const SETTINGS_PAGES=[{href:'/admin/email-templates',label:'メール本文・資料選択'},{href:'/admin/settings',label:'基本設定・資料登録'},{href:'/admin/home-screen',label:'ホーム画面'},{href:'/admin/admin-users',label:'管理者・招待'}]as const;
export function adminSection(path:string){return MASTER_PAGES.some(p=>path===p.href||path.startsWith(p.href+'/'))?'master':SETTINGS_PAGES.some(p=>path===p.href||path.startsWith(p.href+'/'))?'settings':null;}
