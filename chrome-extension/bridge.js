(() => {
const version = chrome.runtime.getManifest().version;
const reloadMessage = 'The Chrome helper was reloaded. Refresh Outreach Desk to reconnect this tab.';
const reply = (requestId, response) => window.postMessage({ source: 'outreach-desk-helper', requestId, version, ...response }, window.location.origin);
window.addEventListener('message', event => {
  const data = event.data;
  if (event.source !== window || event.origin !== window.location.origin || data?.source !== 'outreach-desk' || !['ping-helper', 'prepare-outreach', 'scan-people'].includes(data?.type)) return;
  try {
    if (!chrome.runtime?.id) { reply(data.requestId, { ok: false, error: reloadMessage }); return; }
    if (data.type === 'ping-helper') { reply(data.requestId, { ok: true }); return; }
    chrome.runtime.sendMessage({ type: data.type, payload: data.payload }, response => {
    try {
    const runtimeError = chrome.runtime.lastError?.message || '';
    const error = /message port closed|receiving end does not exist/i.test(runtimeError) ? 'Chrome helper was updated but is not active on this tab. Reload the extension, then reload Outreach Desk once.' : runtimeError || response?.error;
    reply(data.requestId, { ok: !!response?.ok, error });
    } catch { reply(data.requestId, { ok: false, error: reloadMessage }); }
    });
  } catch { reply(data.requestId, { ok: false, error: reloadMessage }); }
});
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'people-scan-results') window.postMessage({ source: 'outreach-desk-helper', type: 'people-scan-results', payload: message.payload }, window.location.origin);
  if (message?.type === 'people-scan-batch') window.postMessage({ source: 'outreach-desk-helper', type: 'people-scan-batch', payload: message.payload }, window.location.origin);
  if (message?.type === 'people-scan-progress') window.postMessage({ source: 'outreach-desk-helper', type: 'people-scan-progress', payload: message.payload }, window.location.origin);
  if (message?.type === 'outreach-delivered') window.postMessage({ source: 'outreach-desk-helper', type: 'outreach-delivered', contactId: message.contactId }, window.location.origin);
});
window.postMessage({ source: 'outreach-desk-helper', type: 'helper-ready', version }, window.location.origin);
})();
