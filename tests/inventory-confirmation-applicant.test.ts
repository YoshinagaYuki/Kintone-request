import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmationApplicant} from '../lib/inventory/confirmation-applicant';
test('internal confirmation explicitly omits contact, including prefilled email',()=>{
 assert.deepEqual(confirmationApplicant({applicant_name:'担当者',applicant_phone:'090',applicant_email:'prefilled@example.com',skip_applicant_contact:true}),{applicant_name:'担当者',applicant_phone:'',applicant_email:'',skip_applicant_contact:true});
});
test('omission needs literal true and still requires a name',()=>{
 assert.throws(()=>confirmationApplicant({applicant_name:'担当者',skip_applicant_contact:'true'}));
 assert.throws(()=>confirmationApplicant({skip_applicant_contact:true}));
});
test('ordinary confirmation requires valid contacts and supports multiple recipients',()=>{
 assert.throws(()=>confirmationApplicant({applicant_name:'担当者',applicant_phone:'090',applicant_email:'invalid'}));
 const result=confirmationApplicant({applicant_name:'担当者',applicant_phone:'090',applicant_email:'a@example.com,b@example.com'});
 assert.equal(result.skip_applicant_contact,false);assert.match(result.applicant_email,/b@example.com/);
});
