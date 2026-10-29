// Shared by the page extractor and local importer. A keyword match is not employment evidence.
(() => {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  function currentEmployment(person, company = person.company) {
    const target = normalize(company);
    if (!target) return '';
    const headline = String(person.headline || '');
    const current = String(person.currentEmploymentEvidence || '');
    const candidates = [...headline.split(/[|;\n•]/), ...current.split('\n').filter(line => /^\s*current\s*:/i.test(line))];
    for (const candidate of candidates) {
      if (/\b(?:ex|former|formerly|previous|previously|past|worked|was|alumni|not|incoming|aspiring|seeking)\b|\bno longer\b/i.test(candidate)) continue;
      if (!/design|user experience|recruit|talent|human resources|\bhr\b|founder/i.test(candidate)) continue;
      const relationship = candidate.match(/(?:\bat\s+|@\s*)(.+)$/i);
      if (!relationship) continue;
      // Exact company phrase, never a substring such as Meta in Metaverse.
      const employer = normalize(relationship[1]);
      if (employer === target || employer.startsWith(`${target} `) && /^(?:india|pvt ltd|private limited|limited|inc|ltd)$/.test(employer.slice(target.length).trim())) return candidate.trim();
    }
    return '';
  }
  globalThis.outreachCurrentEmployment = currentEmployment;
})();
