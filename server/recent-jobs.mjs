const DAY_MINUTES = 72 * 60;

export function recentJobMinutes(value) {
  const label = String(value || '').trim();
  if (/^(?:within\s+)?past (?:24 hours|3 days)(?:\s+\(linkedin filter\))?$/i.test(label)) return 0;
  if (/^(?:posted|reposted)?\s*(?:just now|today)$/i.test(label)) return 0;
  const match = label.match(/^(?:posted|reposted)?\s*(\d+)\s*(minute|hour|day)s?\s*ago$/i);
  if (!match) return null;
  return Number(match[1]) * ({minute:1,hour:60,day:1440}[match[2].toLowerCase()]);
}

export function isLatestJob(job) {
  const minutes = recentJobMinutes(job?.recency);
  return minutes !== null && minutes < DAY_MINUTES;
}
