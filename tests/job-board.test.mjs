import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBoardJobs, createJobBoard, jobSnapshot, jobSearchEligibility } from '../server/job-board.mjs';
import { founderFromDiscovery } from '../server/founder-discovery.mjs';

const now = Date.now(), date = new Date(now - 3600000).toISOString();
const job = { url: 'https://jobicy.com/jobs/123-ux-designer', jobTitle: 'UX Designer', companyName: 'Acme', jobType: ['Full-Time'], jobGeo: 'India', pubDate: date, jobDescription: '<p>Design useful products</p>' };
test('job board preserves evidence, source and exact age and excludes interns, part-time and invalid URLs', () => {
  const jobs = normalizeBoardJobs('Jobicy', { jobs: [job, {...job,jobTitle:'UX Designer Intern'}, {...job,jobType:['Part-Time']}, {...job,url:'http://127.0.0.1/private'}, {...job,pubDate:'invalid'}, {...job,pubDate:new Date(now-8*86400000).toISOString()}] }, now);
  assert.equal(jobs.length,1); assert.equal(jobs[0].facts.company.value,'Acme'); assert.equal(jobs[0].sourceName,'Jobicy'); assert.equal(jobs[0].publishedAt,date);
  assert.equal(jobSnapshot({...jobs[0],id:'saved'}, now).verifiedJobId,'saved');
  assert.equal(jobSearchEligibility({...jobs[0],publishedAt:new Date(now-48*3600000).toISOString()},now).eligible,true);
  assert.throws(()=>jobSnapshot({...jobs[0],publishedAt:new Date(now-73*3600000).toISOString()},now),/3-day/);
});

test('targeted eligibility ages LinkedIn evidence and rejects invalid or expired timestamps', () => {
  const saved = { id:'existing', facts:{title:{value:'UX Designer'},company:{value:'Acme'}}, extraction:'visible_linkedin_search', sourceRecency:'2 hours ago', createdAt:new Date(now-71*3600000).toISOString() };
  assert.equal(jobSearchEligibility(saved,now).eligible,false);
  assert.equal(jobSearchEligibility(saved,now).ageMinutes,4380);
  const refreshed = {...saved, observedAt:new Date(now).toISOString()};
  assert.equal(jobSearchEligibility(refreshed,now).eligible,true);
  assert.equal(jobSnapshot(refreshed,now).recency,'120 minutes ago');
  for (const change of [{publishedAt:'invalid'}, {createdAt:'invalid'}, {publishedAt:new Date(now+60000).toISOString()}, {publishedAt:new Date(now-3*86400000).toISOString()}]) assert.equal(jobSearchEligibility({...saved,...change},now).eligible,false);
  assert.match(jobSearchEligibility({...refreshed,extraction:'manual'},now).reason,/Full-time/);
});

test('job feed refresh admits only explicitly India-based listings', () => {
  const jobs = normalizeBoardJobs('Jobicy', {jobs:['India','Bengaluru, India','Brazil','United States','Worldwide','Remote'].map((jobGeo,i)=>({...job,jobGeo,url:`https://jobicy.com/jobs/${i}`}))},now);
  assert.equal(jobs.length,2);
  assert.ok(jobs.every(job=>job.facts.location.value.includes('India')));
});
test('board coalesces concurrent requests, deduplicates jobs, caches each feed and reports partial failures', async () => {
  const values={}, jobs=[]; let calls=0;
  const store={get:(key,fallback)=>values[key]??fallback,set:(key,value)=>values[key]=value,jobs:()=>jobs,addJob:(url,data)=>jobs.push({url,...data})};
  const board=createJobBoard(store,async url=>{calls++;if(url.includes('remotive')) { throw Error('Network unavailable'); } return {ok:true,text:async()=>JSON.stringify({jobs:[job]})};});
  const [first,second]=await Promise.all([board.sync(),board.sync()]);
  assert.equal(first.added,1); assert.equal(second.added,1); assert.equal(calls,2); assert.match(first.sources.Remotive.status,/Unavailable/);
  await board.sync(); assert.equal(calls,2); assert.equal(jobs.length,1);
  for (const source of Object.values(values.jobBoardSources)) source.attemptAt = new Date(Date.now()-3600001).toISOString();
  await board.sync(); assert.equal(calls,3, 'Jobicy refreshes hourly; Remotive retains its six-hour source limit');
});
test('Google-discovered founders need current profile evidence but no job or funding, with pitch and links', () => {
  const person={name:'Asha Rao',company:'Acme',headline:'Co-founder at Acme',location:'Indore, India',profileUrl:'https://www.linkedin.com/in/asha-example/',startupSourceUrl:'https://www.linkedin.com/company/acme/',googleUrl:'https://www.google.com/search?q=Acme+founder',evidence:'Co-founder at Acme'};
  const contact=founderFromDiscovery(person);
  assert.equal(contact.jobId,''); assert.equal(contact.contactRole,'founder'); assert.ok(contact.message.length<=290); assert.match(contact.message,/pitch/); assert.doesNotMatch(contact.message,/opening|refer me/); assert.match(contact.message,/karteek.work/);
  for(const change of [{headline:'Former founder at Acme'},{location:'London, UK'},{headline:'Founder at Other'},{profileUrl:'javascript:alert(1)'},{googleUrl:'https://evil.example/search'}]) assert.throws(()=>founderFromDiscovery({...person,...change}));
});
