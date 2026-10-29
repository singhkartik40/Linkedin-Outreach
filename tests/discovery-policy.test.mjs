import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleDesignJob, withinCompanyQuota, explicitlyFormerEmployee, currentEmployment } from '../server/discovery-policy.mjs';

test('current employer requires role evidence, never a previous-company keyword', () => {
  for (const headline of ['UX Designer at Acme', 'Talent Acquisition @ Acme', 'UX Designer at Acme | Ex Other']) assert.ok(currentEmployment({company:'Acme',headline}));
  for (const headline of ['UX Designer at Other | Ex-Acme', 'Former UX Designer at Acme', 'Previously at Acme | Designer', 'Designer at Acme Labs', 'UX Designer', 'Worked at Acme', 'UX Designer at Metaverse']) assert.equal(currentEmployment({company:headline.includes('Metaverse')?'Meta':'Acme',headline}), '');
  assert.ok(currentEmployment({company:'Acme',headline:'UX Designer',currentEmploymentEvidence:'Current: Product Designer at Acme'}));
  assert.equal(currentEmployment({company:'Acme',headline:'UX Designer at Other',currentEmploymentEvidence:'Past: Product Designer at Acme'}),'');
  assert.equal(currentEmployment({company:'Acme',headline:'UX Designer',companyVerified:true}),'');
});

test('explicit former-company headlines are excluded from current-employee discovery', () => {
  assert.equal(explicitlyFormerEmployee({ company: 'OneBanc', headline: 'Talent Acquisition @AdGrid | Ex-Urban Company | Ex-OneBanc' }), true);
  assert.equal(explicitlyFormerEmployee({ company: 'OneBanc', headline: 'Product Designer at OneBanc | Ex-Urban Company' }), false);
  assert.equal(explicitlyFormerEmployee({ company: 'Acme', headline: 'Formerly at Acme Labs' }), true);
});
test('design jobs exclude internships, contract and unrelated roles', () => {
 for (const title of ['UX Designer','Senior Product Designer','UI/UX Designer']) assert.ok(eligibleDesignJob({title}));
 for (const title of ['UX Designer Intern','Product Designer Internship','Contract UX Designer','Full Stack Engineer','Part-time UI Designer']) assert.equal(eligibleDesignJob({title}), false);
});
test('a company can contribute only two designers and two HR contacts per scan', () => {
 const accepted = [];
 for (const headline of ['UX Designer','Product Designer','UI Designer','Recruiter','HR Partner','Talent Acquisition']) {
  const person = { company: 'Acme', headline };
  if (withinCompanyQuota(person, accepted)) accepted.push(person);
 }
 assert.equal(accepted.length, 4);
 assert.equal(withinCompanyQuota({company:'ACME',headline:'Recruiter'},accepted),false);
 assert.equal(withinCompanyQuota({company:'Other',headline:'UX Designer'},accepted),true);
});
