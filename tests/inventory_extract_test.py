import unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('extract',Path(__file__).parents[1]/'scripts/inventory/extract-sheet.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SourceExtraction(unittest.TestCase):
 def source(self):
  data={name:{'cells':{},'merges':[]} for name in module.names};db={'requests':[],'item_name_master':[{'id':str(i),'name':product,'category':'allmight'} for i,product in enumerate(module.names.values())]};return data,db
 def test_vertical_merges_preserve_each_unit_and_full_dates(self):
  data,db=self.source();data['STC(小)']={'cells':{'A2':'１０月','B2':'1','C2':'担当者','C3':'イベント場所','B4':'2','C4':'担当者','C5':'イベント場所','D3':'999：店舗'},'merges':['D3:F5']};records,coverage=module.extract(data,db);self.assertEqual([(r['source_cell'],r['start_date'],r['end_date']) for r in records],[('D3','2026-10-01','2026-10-03'),('D5','2026-10-01','2026-10-03')]);self.assertTrue(all(r['state']=='hold' for r in records));self.assertEqual(sum(r['occupied_day_cells'] for r in coverage),6)
 def test_staff_only_shipping_merged_over_both_rows_is_not_double_counted(self):
  data,db=self.source();data['クレーンゲーム']={'cells':{'A3':'１０月','C3':'担当者','C4':'イベント場所','S3':'配送期間'},'merges':['S3:X4']};records,coverage=module.extract(data,db);self.assertEqual(len(records),1);self.assertEqual((records[0]['start_date'],records[0]['end_date'],records[0]['state']),('2026-10-16','2026-10-21','blocked'));self.assertEqual(coverage[0]['occupied_day_cells'],6)
 def test_staff_only_blocks_and_year_rollover(self):
  data,db=self.source();data['ATD v1']={'cells':{'A2':'１２月','C2':'担当者','C3':'イベント場所','AG2':'不可','AH2':'不可','A4':'１月','C4':'担当者','C5':'イベント場所','D5':'翌年店舗'},'merges':[]};records,_=module.extract(data,db);self.assertEqual(records[0]['state'],'blocked');self.assertEqual(records[0]['end_date'],'2026-12-31');self.assertEqual(records[1]['start_date'],'2027-01-01')
if __name__=='__main__':unittest.main()
