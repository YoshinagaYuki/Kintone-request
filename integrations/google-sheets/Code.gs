/** Bound to the existing inventory workbook. Preserves rows 1–249 of the original input tabs.
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
  const tabs=Object.entries(INVENTORY_TABS);
  const responses=UrlFetchApp.fetchAll(tabs.map(([name,product])=>({url:feed+'&months=6&layout=mirror&product='+encodeURIComponent(product),muteHttpExceptions:true})));
  // Validate every product before any writes. A failed feed leaves the last good mirror intact.
  const plans=tabs.map(([name,product],i)=>{
   if(responses[i].getResponseCode()!==200)throw Error('feed unavailable');
   const raw=responses[i].getContentText('UTF-8'),data=JSON.parse(raw);
   if(data.version!==1||data.product!==product||!Array.isArray(data.values)||!data.values.length||data.values.length>4000||data.values.some(r=>r.length!==33)||data.backgrounds.length!==data.values.length||data.notes.length!==data.values.length)throw Error('invalid mirror');
   return {name,data,hash:Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw))};
  });
  for(const plan of plans){
   const name='ガント '+plan.name.trim(),data=plan.data;let sheet=book.getSheetByName(name);
   if(sheet)ensureMirrorEditors(sheet);
   if(sheet&&props.getProperty('mirror:'+name)===plan.hash)continue;
   if(!sheet)sheet=book.insertSheet(name);
   const needed=data.values.length+4,oldRows=Number(props.getProperty('mirrorRows:'+name)||0);
   if(sheet.getMaxRows()<needed)sheet.insertRowsAfter(sheet.getMaxRows(),needed-sheet.getMaxRows());
   if(sheet.getMaxColumns()<33)sheet.insertColumnsAfter(sheet.getMaxColumns(),33-sheet.getMaxColumns());
   const area=sheet.getRange(1,1,Math.max(needed,oldRows,5),33);area.breakApart();area.clear();
   sheet.setHiddenGridlines(true);sheet.setFrozenRows(4);sheet.setFrozenColumns(2);
   sheet.setColumnWidth(1,36);sheet.setColumnWidth(2,88);sheet.setColumnWidths(3,31,46);
   area.setFontFamily('Arial').setFontSize(10).setFontColor('#334155').setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
   sheet.getRange(1,1,1,2).merge().setValue('在庫管理表').setBackground('#0f172a').setFontColor('#ffffff').setFontSize(10);sheet.getRange(1,3,1,31).merge().setValue(data.product).setBackground('#0f172a').setFontColor('#ffffff').setFontSize(14).setFontWeight('bold');sheet.setRowHeight(1,38);
   const stamp=Utilities.formatDate(new Date(),'Asia/Tokyo','MM/dd HH:mm:ss');
   sheet.getRange(2,1,1,2).merge().setValue('自動更新').setBackground('#f8fafc');sheet.getRange(2,3,1,31).merge().setValue(stamp+'　／　閲覧用（入力は管理画面から）　／　'+data.from+' 〜 '+data.to).setBackground('#f8fafc').setFontSize(10);sheet.setRowHeight(2,26);
   const legend=[['登録完了','#d1fae5'],['仮押さえ','#fef3c7'],['申請待ち','#dbeafe'],['延長','#ede9fe'],['予備','#e2e8f0']];
   legend.forEach(([label,color],i)=>sheet.getRange(3,3+i*4,1,4).merge().setValue(label).setBackground(color).setHorizontalAlignment('center'));sheet.setRowHeight(3,24);sheet.setRowHeight(4,8);
   const values=data.values.map(row=>row.map(value=>/^[=+@\-\t\r]/.test(value)?"'"+value:value));
   const grid=sheet.getRange(5,1,values.length,33);grid.setNumberFormat('@').setValues(values).setBackgrounds(data.backgrounds).setNotes(data.notes).setBorder(true,true,true,true,true,false,'#e2e8f0',SpreadsheetApp.BorderStyle.SOLID);
   sheet.setRowHeights(5,values.length,24);sheet.getRange(5,1,values.length,2).setHorizontalAlignment('center').setFontSize(9);
   data.merges.forEach(m=>sheet.getRange(5+m.row,1+m.column,1,m.span).merge());
   data.headerRows.forEach(row=>{sheet.setRowHeight(5+row,38);sheet.getRange(5+row,1,1,33).setFontWeight('bold').setHorizontalAlignment('center').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);sheet.getRange(5+row,1,1,2).setFontColor('#ffffff');});
   data.unitEndRows.forEach(row=>sheet.getRange(5+row,1,1,33).setBorder(null,null,true,null,null,null,'#e2e8f0',SpreadsheetApp.BorderStyle.SOLID));
   ensureMirrorEditors(sheet);
   SpreadsheetApp.flush();props.setProperty('mirror:'+name,plan.hash);props.setProperty('mirrorRows:'+name,String(needed));
   const original=book.getSheetByName(plan.name);
   if(original&&!props.getProperty('mirrorMoved:'+name)){
    const previous=Number(props.getProperty('rows:'+plan.name)||0);if(previous>0)original.getRange(251,1,Math.min(previous,900),34).clearContent();
    original.getRange('D250').setValue('最新の在庫表は「'+name+'」タブへ（自動更新・閲覧用）');props.setProperty('mirrorMoved:'+name,'true');
   }
  }
  props.setProperty('last_success',new Date().toISOString());
 }finally{lock.releaseLock();}
}
/** One-minute retry/reconciliation also covers temporary network failures and closed browser windows. */
function installRecoveryTrigger(){
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='syncInventory'))ScriptApp.newTrigger('syncInventory').timeBased().everyMinutes(1).create();
 syncInventory();
}

/** Only the named inventory administrator may edit the generated mirror. */
function ensureMirrorEditors(sheet){
 let protections=sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
 if(!protections.length){const p=sheet.protect().setDescription('自動更新ガント表・指定管理者は編集可');p.removeEditors(p.getEditors());if(p.canDomainEdit())p.setDomainEdit(false);protections=[p];}
 protections.forEach(p=>p.addEditor('y-yoshinaga@unity-corp.jp'));
}
function configureMirrorEditors(){
 const book=SpreadsheetApp.openById('1bEbV3bJvGIBhRdKnf3KwBIoJo-2EA-uXRNx2szq6Qx0');
 Object.keys(INVENTORY_TABS).forEach(name=>{const sheet=book.getSheetByName('ガント '+name.trim());if(sheet)ensureMirrorEditors(sheet);});
 SpreadsheetApp.flush();
}
