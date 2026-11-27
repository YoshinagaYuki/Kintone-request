import {buildKintoneRecord,type FieldMapping,type KintoneRecord} from '../kintone/mapper';
/** Empty changed fields are valid for transport/usage-only edits; full registration still requires a mapping. */
export function mapInventoryChangedFields(parsed:Record<string,unknown>,selected:FieldMapping['mappings']){
 return selected.length?buildKintoneRecord(parsed as Record<string,string>,{mappings:selected}):{ok:true as const,record:{} as KintoneRecord};
}
