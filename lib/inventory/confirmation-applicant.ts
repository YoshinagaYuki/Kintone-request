import {parseEmailRecipients} from '@/lib/email-recipients';

/** Used only after the inventory confirmation endpoint authenticates its admin. */
export function confirmationApplicant(input:Record<string,unknown>){
 const name=typeof input.applicant_name==='string'?input.applicant_name.trim():'';
 if(!name||name.length>100)throw Error('入力者氏名を入力してください（100文字まで）');
 if(input.skip_applicant_contact===true)return {applicant_name:name,applicant_phone:'',applicant_email:'',skip_applicant_contact:true};
 const phone=typeof input.applicant_phone==='string'?input.applicant_phone.trim():'';
 if(!phone||phone.length>30)throw Error('入力者電話番号を入力してください（30文字まで）');
 const email=parseEmailRecipients(typeof input.applicant_email==='string'?input.applicant_email:'');
 if(!email.ok)throw Error(email.error);
 return {applicant_name:name,applicant_phone:phone,applicant_email:email.value,skip_applicant_contact:false};
}
