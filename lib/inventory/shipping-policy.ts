import {addDays,validDate} from './gantt';
export const SHIPPING_ORIGIN='埼玉県朝霞市';
export const SHIPPING_REVIEWED='2026-10-29';
export const PREFECTURES='北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
export const SHIPPING_SOURCES={seino:'https://track.seino.co.jp/lts/leadTimeSearch.do',sagawa:'https://www2.sagawa-exp.co.jp/send/days/input/',jitbox:'https://www.008008.jp/b/jitbox/',seinoCalendar:'https://www.seino.co.jp/seino/media/pdf-lib/20260312-01.pdf',jitCalendar:'https://yamatobc.com/assets/uploads/2025/11/JITBOXチャーター便-2025年度・2026年度配達定休日について_1762909920.pdf',notices:'https://www2.sagawa-exp.co.jp/information/detail/417/'};
export type TransportInput={address:string;returnAddress?:string;carrier?:'seino'|'sagawa';specialArea?:boolean;outboundDays?:number;returnDays?:number;confirmed?:boolean};
export type ShippingBooking={transport?:TransportInput;deliveryRequired?:boolean;pickupRequired?:boolean;start:string;end:string;delivery:string;pickup:string;from:string;to:string};
export type ShippingPlan={carrier:'seino'|'sagawa'|'jitbox';outboundDays:number|null;returnDays:number|null;dispatch:string;returned:string;from:string;to:string;warnings:string[];unresolved:boolean;nextDispatch:string};
export const shippingCarrier=(name:string,choice?:TransportInput['carrier'])=>['クレーンゲーム','イライラスティックver.2'].includes(name.normalize('NFKC').replace(/\s/g,''))?'jitbox' as const:choice??'seino';
export function parseTransport(value:unknown):TransportInput|undefined{
 if(value==null)return undefined;if(typeof value!=='object'||Array.isArray(value))throw Error('配送設定を確認してください');const v=value as Record<string,unknown>;
 if(typeof v.address!=='string'||v.address.length>500||v.returnAddress!=null&&(typeof v.returnAddress!=='string'||v.returnAddress.length>500))throw Error('配送・集荷先住所は500文字以内で入力してください');
 if(v.carrier!=null&&!['seino','sagawa'].includes(v.carrier as string))throw Error('配送会社を選択してください');
 const result:TransportInput={address:v.address.trim(),returnAddress:typeof v.returnAddress==='string'?v.returnAddress.trim():undefined,carrier:v.carrier as TransportInput['carrier']};
 for(const key of ['outboundDays','returnDays']as const)if(v[key]!=null&&v[key]!==''){if(!Number.isInteger(v[key])||(v[key]as number)<1||(v[key]as number)>30)throw Error('輸送日数は1〜30日で指定してください');result[key]=v[key]as number;}
 for(const key of ['specialArea','confirmed']as const)if(v[key]!=null){if(typeof v[key]!=='boolean')throw Error('配送確認の選択内容を確認してください');result[key]=v[key]as boolean;}return result;
}
export const destinationPrefecture=(address:string)=>PREFECTURES.find(p=>address.normalize('NFKC').replace(/\s/g,'').includes(p));
const remote=/(離島|小笠原|大島町|利島村|新島村|神津島|三宅村|御蔵島|八丈|青ヶ島|佐渡|隠岐|壱岐|対馬|五島|奄美|大島郡|種子島|屋久島|甑島|利尻|礼文|奥尻)/;
/** Conservative internal planning defaults, NOT a prefecture-wide carrier promise.
 * Major-city Seino queries (Asaka, 2026-10-29) and JIT published city tables underpin these bands.
 * Okinawa/islands/unknown destinations never receive a guessed lead time. */
function days(address:string,carrier:ShippingPlan['carrier'],special=false){
 const pref=destinationPrefecture(address);if(!pref||pref==='沖縄県'||special||remote.test(address))return null;
 if(pref==='北海道')return /札幌市|小樽市|千歳市|恵庭市|苫小牧市/.test(address)?2:null;
 const west=PREFECTURES.indexOf(pref)>=30;
 if(carrier==='jitbox')return west?2:1;
 return west||pref==='秋田県'?2:1;
}
const dow=(d:string)=>new Date(d+'T00:00:00Z').getUTCDay();
const seinoHolidays=new Set(['2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-23','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03','2027-01-11','2027-02-11','2027-02-23','2027-03-22']);
export function carrierClosed(date:string,carrier:ShippingPlan['carrier']){if(!validDate(date))return false;if(carrier==='sagawa')return false;if(carrier==='jitbox')return dow(date)===0||['2026-12-31','2027-01-01','2027-01-02','2027-01-03'].includes(date);return dow(date)===0||seinoHolidays.has(date);}
function move(date:string,n:number,carrier:ShippingPlan['carrier']){let result=date;for(let i=0;i<n;i++){result=addDays(result,1);while(carrierClosed(result,carrier))result=addDays(result,1);}return result;}
function backwards(date:string,n:number,carrier:ShippingPlan['carrier']){let result=date;for(let i=0;i<n;i++){result=addDays(result,-1);while(carrierClosed(result,carrier))result=addDays(result,-1);}return result;}
function seasonal(date:string,address:string){const md=date.slice(5),month=Number(date.slice(5,7));const messages:string[]=[];
 if(md>='04-25'&&md<='05-08')messages.push('GW：休業・縮小運行を確認してください');
 if(md>='08-08'&&md<='08-18')messages.push('お盆：休業・縮小運行を確認してください');
 if(md>='12-20'||md<='01-10')messages.push('年末年始：休業・集荷締切を確認してください');
 if(md>='11-15'&&md<='12-10')messages.push('ブラックフライデー・年末商戦：物量増加に注意してください');
 if(date>='2026-10-10'&&date<='2026-10-26')messages.push('Amazonプライム感謝祭の前後：2026年の公式開催10/16〜19・先行10/13〜15。発送集中を確認してください');
 if(month===7||(month===10&&!date.startsWith('2026-')))messages.push('大型通販セール注意月：Amazon等の開催日は毎年変わるため最新案内を確認してください');
 if((month>=11||month<=3)&&/北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|新潟県|富山県|石川県|福井県|長野県/.test(address))messages.push('積雪期：降雪・通行止め・フェリー欠航を確認してください');return messages;
}
export function shippingPlan(b:ShippingBooking,itemName:string):ShippingPlan{
 const t=b.transport,carrier=shippingCarrier(itemName,t?.carrier),out=!!t&&b.deliveryRequired!==false,back=!!t&&b.pickupRequired!==false;
 const od=out?(t?.outboundDays??days(t!.address,carrier,t?.specialArea)):0,rd=back?(t?.returnDays??days(t!.returnAddress||t!.address,carrier,t?.specialArea)):0;
 const warnings:string[]=[],delivery=validDate(b.delivery)?b.delivery:b.start,pickup=validDate(b.pickup)?b.pickup:b.end;
 let dispatch=out&&od!=null&&validDate(delivery)?backwards(delivery,od,carrier):b.from,returned=back&&rd!=null&&validDate(pickup)?move(pickup,rd,carrier):b.to;
 const allDates=[dispatch,delivery,pickup,returned].filter(validDate);const address=[t?.address,t?.returnAddress].filter(Boolean).join(' ');
 if(t){if(carrier==='sagawa'&&(out||back))warnings.push('佐川急便：表示日数は社内計画目安です。郵便番号・荷姿別の公式日数を確認してください');
  if(out&&od==null||back&&rd==null)warnings.push('この地域の輸送日数は個別確認が必要です。運送会社で確認した往路・復路の日数を入力してください');
  if(out&&carrierClosed(delivery,carrier))warnings.push('指定の納品日は運休・配達定休日です。営業所への確認が必要です');
  if(back&&carrierClosed(pickup,carrier))warnings.push('指定の集荷日は運休・配達定休日です。営業所への確認が必要です');
  if(allDates.some(d=>d<'2026-04-01'||d>'2027-03-31'))warnings.push('公表済み営業カレンダーの対象外です。最新年度の営業日を確認してください');
  if((out||back)&&/北海道|沖縄県/.test(address))warnings.push('北海道・沖縄：地区・船便・復路の日数を営業所で確認してください');
  if(t.specialArea||remote.test(address))warnings.push('離島・遠隔地：航路・集配可能日・輸送日数を確認してください');
  if(t.outboundDays!=null||t.returnDays!=null)warnings.push('輸送日数を手動設定しています。往復の運行条件を確認してください');
  for(const d of allDates)warnings.push(...seasonal(d,address));
  if(carrier==='jitbox'&&allDates.some(d=>dow(d)===2))warnings.push('JITBOX：火曜日は一部地域で2マン配達が休みです。必要な場合は確認してください');
  if(carrier==='jitbox'&&allDates.includes('2026-12-30'))warnings.push('JITBOX：12/30は2マン配達定休日です。必要な場合は日程を調整してください');
  if(carrier==='seino'&&allDates.some(d=>dow(d)===6||['2026-04-30','2026-05-01','2026-05-02','2026-08-10','2026-11-03','2027-01-04'].includes(d)))warnings.push('西濃運輸：土曜日・特定日の縮小運行に該当します。締切・集配条件を確認してください');
 }
 // Busy/snow periods get one extra operating day per leg as an internal safety margin.
 const safety=!!t&&allDates.some(d=>seasonal(d,address).length>0);
 if(safety){if(out&&od!=null)dispatch=backwards(dispatch,1,carrier);if(back&&rd!=null)returned=move(returned,1,carrier);warnings.push('繁忙期・積雪期の社内余裕を往復それぞれ1運行日加算しています（遅延保証ではありません）');}
 const from=[b.from,dispatch].filter(validDate).sort()[0]||b.from,to=[b.to,returned].filter(validDate).sort().at(-1)||b.to;
 const unresolved=!!t&&((out&&od==null)||(back&&rd==null));
 // Three whole calendar days AFTER collection, plus an actual return to the warehouse.
 const base=validDate(pickup)?addDays(pickup,4):to;
 return{carrier,outboundDays:od,returnDays:rd,dispatch,returned,from,to,warnings:[...new Set(warnings)],unresolved,nextDispatch:[base,validDate(to)?addDays(to,1):to].sort().at(-1)!};
}
export function assertTransportReady(b:ShippingBooking,item:string){const plan=shippingPlan(b,item);if(plan.unresolved)throw Error('配送日数を確定してください。北海道の遠隔地・沖縄・離島・住所未設定は個別確認が必要です');if(plan.warnings.length&&!b.transport?.confirmed)throw Error('配送の注意事項を確認し、確認済みにチェックしてください');return plan;}
