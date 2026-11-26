export const DRAFT_MAX_AGE=7*24*60*60*1000;
export function readFormDraft(raw:string,baseline:string,now=Date.now()):Record<string,unknown>|null{
 try{
  const draft=JSON.parse(raw);
  if(draft.version!==1||draft.baseline!==baseline||!Number.isFinite(draft.at)||draft.at>now+60000||now-draft.at>=DRAFT_MAX_AGE||!draft.value||typeof draft.value!=='object'||Array.isArray(draft.value))return null;
  return draft.value;
 }catch{return null;}
}
