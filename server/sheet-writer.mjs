import { profileSlug } from './domain.mjs';

const deploymentUrl = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export function createSheetWriter({ url = process.env.SHEET_WRITE_WEB_APP_URL, token = process.env.SHEET_WRITE_TOKEN, fetcher = fetch } = {}) {
  const endpoint = String(url || '').trim(), secret = String(token || '').trim();
  const configured = () => deploymentUrl.test(endpoint) && secret.length >= 32;
  return {
    configured,
    async markDone(contact, spreadsheetId) {
      if (!configured()) throw new Error('Automatic Sheet updates are not configured. Add the Apps Script URL and write token in .env, then restart Outreach Desk.');
      const slug = profileSlug(contact.profileUrl);
      if (!slug) throw new Error('The contact needs a valid LinkedIn profile before updating the Sheet.');
      const payload = {
        action: 'markDone', token: secret, spreadsheetId,
        contact: { name: contact.name, company: contact.company, profileUrl: contact.profileUrl, jobTitle: contact.jobTitle, jobUrl: contact.jobUrl, message: contact.message, confirmedAt: contact.confirmedAt },
      };
      let response;
      try {
        response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: AbortSignal.timeout(20000) });
      } catch { throw new Error('The Sheet writer could not be reached. Delivery remains confirmed locally; retry the Sheet update.'); }
      if (!response.ok) throw new Error('The Sheet writer rejected the request. Delivery remains confirmed locally; retry the Sheet update.');
      let result;
      try { result = await response.json(); } catch { throw new Error('The Sheet writer returned an invalid response. Delivery remains confirmed locally.'); }
      if (!result?.ok || result.spreadsheetId !== spreadsheetId || result.profileSlug !== slug || !['Sent', 'Invitation pending'].includes(result.status) || !Number.isInteger(result.rowNumber) || result.rowNumber < 2) {
        // An upstream error may echo the token or request body. Keep it out of the UI.
        throw new Error('Sheet update was not verified. Check the writer configuration and retry.');
      }
      return { rowNumber: result.rowNumber, status: result.status };
    },
  };
}
