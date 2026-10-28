const requiredTabs = ['Master', 'By date', 'Jobs to research', 'Instructions'];

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function inspectTracker(metadata, valueRanges) {
  const tabs = metadata.sheets.map(s => s.properties.title);
  const missingTabs = requiredTabs.filter(t => !tabs.includes(t));
  const master = valueRanges.find(r => /^'?Master'?\!/.test(r.range))?.values || [];
  const headers = master[0] || [];
  const expected = ['S. No.', 'Person', 'Company', 'Type', 'Profile URL', 'Status', 'Added (IST)', 'Sent on (IST)', 'Role / Job', 'Experience', 'Note', 'Note characters', 'Job / funding source', 'Batch', 'Original Notion record', 'Verification / migration notes', 'Normalised profile', 'Normalised name'];
  const normalized = value => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const missingHeaders = expected.filter(h => !headers.some(x => normalized(x) === normalized(h)));
  return { title: metadata.properties.title, tabs, missingTabs, headers, missingHeaders, rowCount: master.slice(1).filter(r => r.some(v => String(v).trim())).length, schemaValid: !missingTabs.length && !missingHeaders.length, readOnly: true, syncedAt: new Date().toISOString(), valueRanges };
}

export function createGoogle() {
  return {
    status() { return { configured: true, connected: true, readOnly: true, mode: 'public-sheet' }; },
    async sync(id) {
      if (!/^[\w-]{20,}$/.test(id)) throw new Error('The saved spreadsheet ID is invalid.');
      const reads = await Promise.all(requiredTabs.map(async name => {
        const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${new URLSearchParams({ tqx: 'out:csv', sheet: name })}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'follow', cache: 'no-store' });
        if (!response.ok) return null;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/csv')) throw new Error('The tracker is not publicly viewable. In Google Sheets, share it as “Anyone with the link · Viewer”.');
        return { name, values: parseCsv(await response.text()) };
      }));
      const available = reads.filter(Boolean);
      if (!available.some(item => item.name === 'Master')) throw new Error('The public sheet does not contain a readable Master tab.');
      const metadata = { properties: { title: 'Kartik LinkedIn Outreach Master' }, sheets: available.map(item => ({ properties: { title: item.name } })) };
      const valueRanges = available.map(item => ({ range: `'${item.name}'!A:ZZ`, values: item.values }));
      return inspectTracker(metadata, valueRanges);
    }
  };
}
