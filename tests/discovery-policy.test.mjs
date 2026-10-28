import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleDesignJob, withinCompanyQuota, explicitlyFormerEmployee } from '../server/discovery-policy.mjs';

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
