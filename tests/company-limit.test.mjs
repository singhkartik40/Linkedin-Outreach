import test from 'node:test';
import assert from 'node:assert/strict';
import { companyOutreachLimit, repostedAfter } from '../server/company-limit.mjs';
const now = Date.now();
const jobUrl = 'https://www.linkedin.com/jobs/view/123/';
const target = {company:'Acme',jobUrl};
const contacts = Array.from({length:5},(_,i)=>({name:`Person ${i}`,company:'Acme Pvt Ltd',profileUrl:`https://www.linkedin.com/in/person-${i}/`,status:'Sent',jobUrl,confirmedAt:new Date(now-86400000).toISOString()}));
const sheet = rows => ({valueRanges:[{range:"'Master'!A:ZZ",values:[['Person','Company','Profile URL','Status','Job / funding source','Sent on (IST)'],...rows.map(r=>[r.name,r.company,r.profileUrl,r.status,r.jobUrl,r.confirmedAt])]}]});
test('five distinct sends cap a posting; drafts and duplicates do not count',()=>{
  assert.equal(companyOutreachLimit(target,sheet(contacts.slice(0,4))).blocked,false);
  assert.equal(companyOutreachLimit(target,sheet(contacts),contacts).count,5);
  assert.equal(companyOutreachLimit(target,sheet(contacts)).blocked,true);
  assert.equal(companyOutreachLimit(target,sheet(contacts.map(c=>({...c,status:'Ready'})))).count,0);
  assert.equal(companyOutreachLimit({...target,company:'Acme Labs'},sheet(contacts)).count,0);
});
test('known separate postings are independent; missing historical links count conservatively',()=>{
  assert.equal(companyOutreachLimit({...target,jobUrl:'https://www.linkedin.com/jobs/view/456/'},sheet(contacts)).count,0);
  assert.equal(companyOutreachLimit(target,sheet(contacts.map(c=>({...c,jobUrl:''})))).blocked,true);
});
test('only evidenced reposts reset prior dated sends, not ordinary refreshes or unknown dates',()=>{
  const observation={sourceRecency:'Reposted 2 hours ago',observedAt:new Date(now).toISOString()};
  const reset=repostedAfter(observation);
  assert.equal(reset,now-3*3600000);
  assert.equal(companyOutreachLimit({...target,...observation},sheet(contacts)).blocked,false);
  assert.equal(companyOutreachLimit({...target,sourceRecency:'2 hours ago',observedAt:observation.observedAt},sheet(contacts)).blocked,true);
  assert.equal(companyOutreachLimit({...target,...observation},sheet(contacts.map(c=>({...c,confirmedAt:''})))).blocked,true);
  assert.equal(companyOutreachLimit({...target,...observation},sheet(contacts.map(c=>({...c,confirmedAt:new Date(now-3600000).toISOString()})))).blocked,true);
});
test('old drafts remain capped after a fresh repost and founders use company totals',()=>{
  assert.equal(companyOutreachLimit({...target,postingRepostedAfter:0,sourceRecency:'Reposted 1 hour ago',observedAt:new Date(now).toISOString()},sheet(contacts)).blocked,true);
  assert.equal(companyOutreachLimit({...target,contactRole:'founder',jobId:'',jobUrl:'https://example.com/'},sheet(contacts)).blocked,true);
});
