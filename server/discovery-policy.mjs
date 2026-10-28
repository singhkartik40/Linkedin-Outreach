export const contactRole = headline => /\b(?:co[ -]?)?founder\b/i.test(headline || '') ? 'founder' : /recruit|talent|human resources|\bhr\b/i.test(headline || '') ? 'talent' : /design|user experience/i.test(headline || '') ? 'designer' : '';
export const eligibleDesignJob = job => /(?:product|ux|ui|user experience|interaction).*design|design.*(?:product|ux|ui)/i.test(job.title || '') && !/\bintern(?:ship)?\b|\bcontract\b|part[ -]time|freelance|temporary/i.test(`${job.title} ${job.source || ''}`);
export function explicitlyFormerEmployee(person) {
  const company = String(person.company || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const headline = String(person.headline || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!company) return false;
  return [`ex ${company}`, `former ${company}`, `formerly ${company}`, `formerly at ${company}`, `previously at ${company}`].some(label => ` ${headline} `.includes(` ${label} `));
}
export function withinCompanyQuota(person, people) {
  const role = contactRole(person.headline);
  return !!role && people.filter(item => String(item.company).trim().toLowerCase() === String(person.company).trim().toLowerCase() && contactRole(item.headline) === role).length < 2;
}
