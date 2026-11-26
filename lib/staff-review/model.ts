export const reviewLabels={not_required:'担当者確認なし',pending:'担当者確認待ち',approved:'担当者承認済み',returned:'担当者から差し戻し'} as const;
export type ReviewState=keyof typeof reviewLabels;
export function reviewBlocksRegistration(value:unknown){return value==='pending'||value==='returned';}
export function validReviewToken(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export function reviewFields(data:Record<string,unknown>){return Object.entries(data).filter(([key,value])=>!key.startsWith('_')&&typeof value==='string'&&!/^(レンタル品一覧|利益|粗利|原価|社内|DSP|承認|kintone)/.test(key)).map(([label,value])=>({label,value:String(value)}));}
export function reviewSection(label:string){return /利用開始|利用最終|利用終了|実施日/.test(label)?'ご利用期間':/レンタル機|コンテンツ|商品|数量|レンタルプラン/.test(label)?'レンタル内容':/配送|納品|受領/.test(label)?'配送先':/集荷|引渡/.test(label)?'集荷先':'企業・会場・その他';}
