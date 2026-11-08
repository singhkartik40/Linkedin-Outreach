import test from 'node:test';
import assert from 'node:assert/strict';
import { contactRole, eligibleDesignJob, withinCompanyQuota, explicitlyFormerEmployee, currentEmployment } from '../server/discovery-policy.mjs';
import { founderFromDiscovery } from '../server/founder-discovery.mjs';

test('founder office staff are not founders and cannot enter the founder queue', () => {
  for (const headline of ["Founder’s Office @ Zaggle | BA in Economics", "Founder's Office @ Zaggle", 'Founders Office at Zaggle', 'Founder Office at Zaggle']) {
    assert.notEqual(contactRole(headline), 'founder');
    assert.throws(() => founderFromDiscovery({ name: 'Rushil John', company: 'Zaggle', headline, location: 'Hyderabad, Telangana, India', evidence: headline, profileUrl: 'https://www.linkedin.com/in/rushil-john-4b7258262/', startupSourceUrl: 'https://www.linkedin.com/company/zaggleapp/', googleUrl: 'https://www.google.com/search?q=Zaggle+founder' }), /founder role/i);
  }
  assert.equal(contactRole('Co-founder @Zerozilla | Product Engineering & AI Automation for Enterprises'), 'founder');
  assert.equal(contactRole("Talent Acquisition | Founder’s Office @ Zaggle"), 'talent');
});

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

test('comma-separated current founder titles count as explicit employment, while former and different companies do not', () => {
  assert.equal(currentEmployment({ company: 'Acme', headline: 'Co-Founder & CTO, Acme' }), 'Co-Founder & CTO, Acme');
  for (const headline of ['Former Co-Founder, Acme', 'Co-Founder, Acme Labs', 'Founder at Other, Acme']) {
    assert.equal(currentEmployment({ company: 'Acme', headline }), '');
  }
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
