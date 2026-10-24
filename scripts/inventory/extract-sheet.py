from pathlib import Path
import zipfile,xml.etree.ElementTree as E,json,re,unicodedata,calendar,hashlib
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def load(path):
 z=zipfile.ZipFile(path);ss=[''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml'))];rels={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))};data={}
 for sh in E.fromstring(z.read('xl/workbook.xml')).find('s:sheets',ns):
  target=rels[sh.attrib['{'+ns['r']+'}id']];root=E.fromstring(z.read(target.lstrip('/') if target.startswith('/') else 'xl/'+target));cells={};forms={}
  for c in root.findall('.//s:sheetData/s:row/s:c',ns):
   v=c.find('s:v',ns);val=v.text if v is not None else ''
   if c.attrib.get('t')=='s':val=ss[int(val)] if val else ''
   elif c.attrib.get('t')=='inlineStr':val=''.join(c.find('s:is',ns).itertext())
   if val:cells[c.attrib['r']]=val
   f=c.find('s:f',ns)
   if f is not None:forms[c.attrib['r']]=f.text
  data[sh.attrib['name']]={'cells':cells,'forms':forms,'merges':[m.attrib['ref'] for m in root.findall('.//s:mergeCell',ns)]}
 return data

# Source cells remain immutable evidence; the system reconciles linked quantities by day.
names={'STC(小)':'スティックキャッチ（小）','STC(大) ':'スティックキャッチ（大）','JET Cola':'JET Cola','ATD v1':'あひるサンダー','ATD v2':'あひるサンダーv2','IRS ver.1':'イライラスティック','IRS ver.2':'イライラスティックver.2','クレーンゲーム':'クレーンゲーム'}
def norm(s):return unicodedata.normalize('NFKC',s).strip()
def col(s):
 n=0
 for c in s:n=n*26+ord(c)-64
 return n
def cn(n):
 s=''
 while n:n,a=divmod(n-1,26);s=chr(65+a)+s
 return s

def extract(data,db,year=2026):
 requests={}
 for r in db['requests']:
  if r['form_types']['kintone_app_id']==10 and not r['deleted_at'] and r['status']!='rejected' and r['management_no']:requests.setdefault(norm(str(r['management_no'])),[]).append(r)
 items={norm(i['name']):i['id'] for i in db['item_name_master'] if i['category']=='allmight'}
 records=[];coverage=[]
 for tab,product in names.items():
  d=data[tab];cells=d['cells'];merges={};expanded=dict(cells);stores=dict(cells)
  for m in d['merges']:
   a,b=m.split(':');ma=re.fullmatch(r'([A-Z]+)(\d+)',a);mb=re.fullmatch(r'([A-Z]+)(\d+)',b);merges[a]=(col(mb[1]),int(mb[2]))
   for targetrow in range(int(ma[2]),int(mb[2])+1):
    if cells.get(f'C{targetrow}')=='イベント場所':
     stores[f'{ma[1]}{targetrow}']=cells.get(a,'');merges[f'{ma[1]}{targetrow}']=(col(mb[1]),targetrow)
     for j in range(col(ma[1]),col(mb[1])+1):expanded[f'{cn(j)}{targetrow}']=cells.get(a,'')
   if ma[2]==mb[2]:
    for j in range(col(ma[1]),col(mb[1])+1):expanded[f'{cn(j)}{ma[2]}']=cells.get(a,'')
  month=0;y=year
  for row in range(2,250):
   m=re.fullmatch(r'(\d{1,2})月',norm(cells.get(f'A{row}','')))
   if m:
    nxt=int(m[1]);y+=bool(month and nxt<month);month=nxt
   if not month or cells.get(f'C{row}')!='イベント場所':continue
   staffrow=row-1;lastday=calendar.monthrange(y,month)[1];covered=set()
   def record(cell,raw,c,endcol,staff,state=None):
    text=norm(raw);mno=re.match(r'^(\d+)\s*[:：]\s*(.*)$',text,re.S)
    if not mno and re.fullmatch(r'\d+(?:\.0)?',text):no=str(int(float(text)));store='店舗名未入力'
    else:no=mno[1] if mno else '';store=mno[2].strip() if mno else raw
    matches=requests.get(no,[]) if no else []
    status=state or ('linked' if len(matches)==1 else 'review' if len(matches)>1 else 'hold')
    if not no and re.fullmatch(r'(返却|回収|配送|返送|集荷)期間|不可|使用不可',text):status='blocked'
    r={'source_key':hashlib.sha256(f'{tab}:{cell}'.encode()).hexdigest(),'source_tab':tab,'source_cell':cell,'item_id':items[norm(product)],'product':product,'staff_name':' / '.join(sorted(set(staff)-{''})) or '要確認','store_name':store,'management_no':no,'start_date':f'{y}-{month:02}-{c-3:02}','end_date':f'{y}-{month:02}-{endcol-3:02}','source_lane':cells.get(f'B{staffrow}',''),'request_id':matches[0]['id'] if len(matches)==1 and status=='linked' else None,'state':status,'source_raw':raw}
    records.append(r);covered.update(range(c,endcol+1))
   for c in range(4,4+lastday):
    cell=f'{cn(c)}{row}';raw=stores.get(cell,'').strip()
    if not raw:continue
    endcol,endrow=merges.get(cell,(c,row));endcol=min(endcol,3+lastday)
    # Each event row crossed by a vertical merge represents another physical unit.
    if endcol==c:
     st=expanded.get(f'{cn(c)}{staffrow}','')
     while endcol<3+lastday and st and expanded.get(f'{cn(endcol+1)}{staffrow}','')==st and not stores.get(f'{cn(endcol+1)}{row}',''):endcol+=1
    record(cell,raw,c,endcol,[expanded.get(f'{cn(j)}{staffrow}','').strip() for j in range(c,endcol+1)])
   # A staff-only reservation or transit/blocked cell still consumes stock. Never silently drop it.
   c=4
   while c<=3+lastday:
    st=expanded.get(f'{cn(c)}{staffrow}','').strip()
    if c in covered or not st:c+=1;continue
    endcol=c
    while endcol<3+lastday and endcol+1 not in covered and expanded.get(f'{cn(endcol+1)}{staffrow}','').strip()==st:endcol+=1
    blocking=bool(re.fullmatch(r'(返却|回収|配送|返送|集荷)期間|不可|使用不可',norm(st)))
    record(f'{cn(c)}{staffrow}',st if blocking else '店舗名未入力',c,endcol,[st], 'blocked' if blocking else 'hold');c=endcol+1
   expected={c for c in range(4,4+lastday) if expanded.get(f'{cn(c)}{staffrow}','').strip() or expanded.get(f'{cn(c)}{row}','').strip()}
   missing=expected-covered
   if missing:raise ValueError(f'Uncovered source cells: {tab} row {row}: {missing}')
   coverage.append({'tab':tab,'year':y,'month':month,'row':row,'occupied_day_cells':len(expected),'covered_day_cells':len(expected&covered),'missing':len(missing)})
 return records,coverage

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser(description='Read-only complete extraction of the original manual area (rows 1–249). No workbook or DB writes.')
 parser.add_argument('xlsx',type=Path);parser.add_argument('db_snapshot',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--year',type=int,default=2026)
 args=parser.parse_args();records,coverage=extract(load(args.xlsx),json.loads(args.db_snapshot.read_text()),args.year)
 args.output.write_text(json.dumps(records,ensure_ascii=False,indent=2));args.output.with_suffix('.coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2))
 from collections import Counter
 print('states',dict(Counter(r['state'] for r in records)));print('coverage',sum(r['occupied_day_cells'] for r in coverage),'missing',sum(r['missing'] for r in coverage))
