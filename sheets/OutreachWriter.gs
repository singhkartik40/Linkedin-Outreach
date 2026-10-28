// Bound to Kartik LinkedIn Outreach Master. Set script property OUTREACH_WRITE_TOKEN.
const SPREADSHEET_ID = '1M61OSpGnYkTYEbZbsaABS4j7QsxaHRV9L24PXniwIIY';
const STATUS = 'Invitation pending';

function reply_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function normalized_(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function slug_(value) {
  const match = String(value || '').match(/^https:\/\/(?:[a-z]+\.)?linkedin\.com\/in\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : '';
}

function safe_(value) {
  const text = String(value || '').slice(0, 2000);
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function doPost(e) {
  let lock;
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('OUTREACH_WRITE_TOKEN');
    if (!expected || expected.length < 32 || payload.token !== expected || payload.action !== 'markDone' || payload.spreadsheetId !== SPREADSHEET_ID) return reply_({ ok: false, error: 'Unauthorized writer request.' });
    const contact = payload.contact || {};
    const slug = slug_(contact.profileUrl);
    if (!slug || !String(contact.name || '').trim() || !String(contact.confirmedAt || '').trim()) return reply_({ ok: false, error: 'Missing confirmed contact identity.' });
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Master');
    if (!sheet) throw new Error('Master tab is missing.');
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(value => String(value).trim().toLowerCase());
    const column = name => {
      const index = headers.indexOf(name.toLowerCase());
      if (index < 0) throw new Error('Missing Master header: ' + name);
      return index;
    };
    const profileCol = column('Profile URL'), nameCol = column('Person'), statusCol = column('Status'), sentCol = column('Sent on (IST)');
    const matches = [];
    for (let row = 1; row < values.length; row++) {
      const rowSlug = slug_(values[row][profileCol]);
      if (rowSlug === slug) matches.push(row + 1);
      else if (!rowSlug && normalized_(values[row][nameCol]) === normalized_(contact.name)) throw new Error('A row has the same name but no profile URL. Resolve it manually before writing.');
    }
    if (matches.length > 1) throw new Error('Multiple Master rows match this LinkedIn profile. Resolve duplicates manually.');
    let rowNumber = matches[0];
    const sentAt = Utilities.formatDate(new Date(contact.confirmedAt), 'Asia/Kolkata', 'M/d/yyyy HH:mm');
    if (rowNumber) {
      const currentStatus = String(sheet.getRange(rowNumber, statusCol + 1).getDisplayValue()).trim();
      if (!['Sent', 'Invitation pending'].includes(currentStatus)) {
        sheet.getRange(rowNumber, statusCol + 1).setValue(STATUS);
        sheet.getRange(rowNumber, sentCol + 1).setValue(sentAt);
      }
    } else {
      rowNumber = sheet.getLastRow() + 1;
      const serialCol = column('S. No.');
      const serial = values.slice(1).reduce((max, row) => Math.max(max, Number(row[serialCol]) || 0), 0) + 1;
      const fields = {
        'S. No.': serial, 'Person': safe_(contact.name), 'Company': safe_(contact.company), 'Type': 'Job contact', 'Status': STATUS,
        'Added (IST)': sentAt, 'Sent on (IST)': sentAt, 'Profile URL': safe_(contact.profileUrl), 'Role / Job': safe_(contact.jobTitle),
        'Note': safe_(contact.message), 'Note characters': String(contact.message || '').length, 'Job / funding source': safe_(contact.jobUrl),
        'Batch': 'Outreach Desk', 'Normalised profile': 'linkedin.com/in/' + slug, 'Normalised name': normalized_(contact.name).replace(/\s+/g, ''),
      };
      for (const [header, value] of Object.entries(fields)) {
        const cell = sheet.getRange(rowNumber, column(header) + 1);
        // Apply the text guard after transformations, including the normalized name.
        if (!cell.getFormula()) cell.setValue(typeof value === 'string' ? safe_(value) : value);
      }
    }
    SpreadsheetApp.flush();
    const verifiedSlug = slug_(sheet.getRange(rowNumber, profileCol + 1).getDisplayValue());
    const verifiedStatus = String(sheet.getRange(rowNumber, statusCol + 1).getDisplayValue()).trim();
    if (verifiedSlug !== slug || !['Sent', 'Invitation pending'].includes(verifiedStatus)) throw new Error('Sheet readback did not confirm the update.');
    return reply_({ ok: true, spreadsheetId: SPREADSHEET_ID, profileSlug: slug, status: verifiedStatus, rowNumber });
  } catch (error) {
    return reply_({ ok: false, error: String(error.message || 'Sheet write failed.').slice(0, 160) });
  } finally {
    if (lock) lock.releaseLock();
  }
}
