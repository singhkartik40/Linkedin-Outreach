const DAY_MINUTES = 24 * 60;

export function recentJobMinutes(value) {
  const label = String(value || '').trim();
  if (/^(?:within\s+)?past 24 hours(?:\s+\(linkedin filter\))?$/i.test(label)) return 0;
  if (/^(?:posted|reposted)?\s*(?:just now|today)$/i.test(label)) return 0;
  const match = label.match(/^(?:posted|reposted)?\s*(\d+)\s*(minute|hour)s?\s*ago$/i);
  if (!match) return null;
  return Number(match[1]) * (match[2].toLowerCase() === 'hour' ? 60 : 1);
}

export function isLatestJob(job) {
  const minutes = recentJobMinutes(job?.recency);
  return minutes !== null && minutes < DAY_MINUTES;
}
