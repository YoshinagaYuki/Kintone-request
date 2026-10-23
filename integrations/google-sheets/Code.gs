/** Bound to the existing inventory workbook. Never writes rows 1–249.
 * Script properties: FEED_URL (existing CSV URL without product/months), PUSH_KEY.
 * Deploy as web app executing as the owner; callers are authenticated by HMAC.
 */
const INVENTORY_TABS = {
 'STC(小)':'スティックキャッチ（小）','STC(大) ':'スティックキャッチ（大）',
 'JET Cola':'JET Cola','ATD v1':'あひるサンダー','ATD v2':'あひるサンダーv2',
 'IRS ver.1':'イライラスティック','IRS ver.2':'イライラスティックver.2','クレーンゲーム':'クレーンゲーム'
};
function doPost(e) {
 try {
  const p=PropertiesService.getScriptProperties(), body=JSON.parse(e.postData.contents);
  const secret=p.getProperty('PUSH_KEY');
  if(!secret||secret.length<32||!/^\d+$/.test(String(body.timestamp))||Math.abs(Date.now()-Number(body.timestamp))>300000||!/^[a-f0-9]{32}$/.test(body.nonce))throw Error('unauthorized');
  const expected=Utilities.computeHmacSha256Signature(`${body.timestamp}:${body.nonce}`,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  let diff=expected.length^String(body.signature||'').length;
  for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(String(body.signature||'').charCodeAt(i)||0);
  if(diff)throw Error('unauthorized');
  syncInventory();
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
 }catch(e){return ContentService.createTextOutput(JSON.stringify({ok:false})).setMimeType(ContentService.MimeType.JSON);}
}
function syncInventory() {
 const lock=LockService.getScriptLock();if(!lock.tryLock(25000))throw Error('busy');
 try{
  const props=PropertiesService.getScriptProperties(),feed=props.getProperty('FEED_URL');
  if(!feed||!feed.startsWith('https://kintone-request.vercel.app/api/inventory/sheet.csv?key='))throw Error('feed not configured');
  const book=SpreadsheetApp.openById('1bEbV3bJvGIBhRdKnf3KwBIoJo-2EA-uXRNx2szq6Qx0');
  if(!book||book.getId()!=='1bEbV3bJvGIBhRdKnf3KwBIoJo-2EA-uXRNx2szq6Qx0')throw Error('wrong workbook');
  // Fetch and validate every tab before touching any cells. Errors leave the old content intact.
  const plans=Object.entries(INVENTORY_TABS).map(([name,product])=>{
   const sheet=book.getSheetByName(name);if(!sheet)throw Error('missing tab');
   const response=UrlFetchApp.fetch(feed+'&months=6&layout=push&product='+encodeURIComponent(product),{muteHttpExceptions:true});
   if(response.getResponseCode()!==200)throw Error('feed unavailable');
   const rows=Utilities.parseCsv(response.getContentText('UTF-8'));
   if(!rows.length||rows.length>900||rows[0][2]!=='担当者・店舗')throw Error('invalid feed');
   return {name,sheet,rows:rows.map(row=>Array.from({length:34},(_,i)=>row[i]||''))};
  });
  for(const plan of plans){
   if(plan.sheet.getMaxRows()<251+plan.rows.length)plan.sheet.insertRowsAfter(plan.sheet.getMaxRows(),251+plan.rows.length-plan.sheet.getMaxRows());
   // This area was reserved for automatic output in the initial integration.
   const previous=Math.max(Number(props.getProperty('rows:'+plan.name)||0),plan.rows.length);
   plan.sheet.getRange(251,1,Math.min(previous,900),34).clearContent();
   plan.sheet.getRange(251,1,plan.rows.length,34).setNumberFormat('@').setValues(plan.rows);
   plan.sheet.getRange('D250').setValue('システム自動連携｜更新 '+Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss'));
   props.setProperty('rows:'+plan.name,String(plan.rows.length));
  }
  SpreadsheetApp.flush();props.setProperty('last_success',new Date().toISOString());
 }finally{lock.releaseLock();}
}
/** One-minute retry/reconciliation also covers temporary network failures and closed browser windows. */
function installRecoveryTrigger(){
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='syncInventory'))ScriptApp.newTrigger('syncInventory').timeBased().everyMinutes(1).create();
 syncInventory();
}
