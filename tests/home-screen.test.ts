import {test} from 'node:test';import assert from 'node:assert/strict';
import {homePage,HOME_PAGES,legacyHomeRedirect} from '../lib/home-screen';
test('only supported internal destinations are accepted',()=>{
 for(const page of HOME_PAGES)assert.equal(homePage(page.path),page.path);
 for(const invalid of ['https://evil.example','//evil.example','/admin/launch','/admin/requests/secret',null,{},'/admin/inventory/allmight?start=2020-01-01'])assert.equal(homePage(invalid),'/admin/requests');
});
test('old installed icons redirect to personal home, without hijacking browser tabs or deep links',()=>{
 const base={standalone:true,path:'/admin/requests',search:'',preferred:'/admin/inventory/allmight'};
 assert.equal(legacyHomeRedirect(base),base.preferred);
 assert.equal(legacyHomeRedirect({...base,standalone:false}),null);
 assert.equal(legacyHomeRedirect({...base,path:'/admin/requests/123'}),null);
 assert.equal(legacyHomeRedirect({...base,search:'?status=pending'}),null);
 assert.equal(legacyHomeRedirect({...base,preferred:'/admin/requests'}),null);
});
