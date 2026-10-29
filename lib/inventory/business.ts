export type InventoryBusiness='allmight'|'tezukuru';
export const TEZUKURU_KITS=['シールLAB','バウンドボールLAB','スクイーズLAB','実験ラボシーズン','てずくーる','スクイーズLAB(ベルパーク様)','てずくーる！！フェス'] as const;
export function tezukuruKitNames(data:Record<string,unknown>):string[]{
 if(Array.isArray(data._inventory_kit_names))return data._inventory_kit_names.filter((s):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=100);
 const plan=String(data['レンタルプラン']??'');if(/フェス/.test(plan))return['てずくーる！！フェス'];
 if(!/LAB|ラボ|実験/i.test(plan))return['てずくーる'];
 const names:string[]=[];for(let i=1;i<=10;i++){
  const n=String(data[`コンテンツ${i}`]??'');if(!n)continue;
  const kit=/^(HW|ハロウィン|クリスマス|Xmas)/i.test(n)?'実験ラボシーズン':/シール/.test(n)?'シールLAB':/バウンド|スーパーボール/.test(n)?'バウンドボールLAB':/スクイーズ|スライム/.test(n)?'スクイーズLAB':'実験ラボシーズン';
  if(!names.includes(kit))names.push(kit);
 }return names.length?names:['実験ラボシーズン'];
}
