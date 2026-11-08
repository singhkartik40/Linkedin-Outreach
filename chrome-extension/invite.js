(() => {
if (globalThis.__outreachDeskInviteHelper) return;
globalThis.__outreachDeskInviteHelper = true;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
const vanity = new URL(location.href).searchParams.get('vanityName')?.toLowerCase() || '';
const profileVanity = url => { try { return decodeURIComponent(new URL(url).pathname.match(/^\/in\/([^/]+)/)?.[1] || '').toLowerCase(); } catch { return ''; } };
async function waitFor(read, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = read(); if (result) { return result; } await sleep(200); }
  return null;
}
function noteEditor() { return [...document.querySelectorAll('textarea, [contenteditable="true"][role="textbox"]')].find(visible); }
function addNoteButton() { return [...document.querySelectorAll('button, [role="button"]')].find(button => visible(button) && (clean(button.innerText) === 'Add a note' || clean(button.getAttribute('aria-label')) === 'Add a note')); }
function banner(message, error = false) {
  document.getElementById('outreach-desk-invite-status')?.remove();
  const element = document.createElement('div');
  element.id = 'outreach-desk-invite-status';
  element.textContent = message;
  element.style.cssText = `position:fixed;top:16px;right:16px;z-index:2147483647;max-width:360px;padding:14px 16px;border-radius:10px;background:${error ? '#7f1d1d' : '#0f3d68'};color:white;font:14px/1.45 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.28)`;
  document.documentElement.appendChild(element);
}
function editorValue(editor) { return editor instanceof HTMLTextAreaElement ? editor.value : clean(editor.innerText); }
function fillEditor(editor, note) {
  if (editor instanceof HTMLTextAreaElement) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, note);
  } else {
    editor.focus(); document.execCommand('selectAll', false); document.execCommand('insertText', false, note);
  }
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: note }));
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  editor.focus();
}
function watchUserSend(editor) {
  globalThis.outreachWatchSend({editor,kind:'invitation',onStatus:banner});
}
let running = false;
const watchSend = new WeakSet();
let watchingWithoutNote = false;
function trackSend(editor) {
  if (editor ? watchSend.has(editor) : watchingWithoutNote) return;
  if (editor) watchSend.add(editor);
  else watchingWithoutNote = true;
  watchUserSend(editor);
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== 'invite-probe') return;
  sendResponse({ ok: true, page: 'invite' });
  void run().catch(() => {});
});
async function run() {
  if (running) return;
  running = true;
  try {
    const { pendingOutreach } = await chrome.storage.local.get('pendingOutreach');
    if (!pendingOutreach || pendingOutreach.expiresAt < Date.now() || profileVanity(pendingOutreach.profileUrl) !== vanity) return;
    const context = await chrome.runtime.sendMessage({ type: 'outreach-context' });
    if (!context?.receiptToken || context.receiptToken !== pendingOutreach.receiptToken || context.awaitingConfirmation) return;
    const initial = await waitFor(() => noteEditor() || addNoteButton());
    if (initial && initial === addNoteButton()) initial.click();
    const editor = noteEditor() || (initial && await waitFor(noteEditor));
    if (!editor) { trackSend(null); throw new Error('LinkedIn did not open the invitation note editor. The full note is available in Outreach Desk.'); }
    trackSend(editor);
    const note = pendingOutreach.message;
    const maximum = Number(editor.getAttribute('maxlength')) || 300;
    if (note.length > maximum) throw new Error(`The note exceeds LinkedIn's ${maximum}-character limit.`);
    fillEditor(editor, note);
    await sleep(200);
    if (!visible(editor) || editorValue(editor) !== note) throw new Error('LinkedIn did not retain the note. Paste the full note from Outreach Desk.');
    const latest = await chrome.storage.local.get('pendingOutreach');
    if (latest.pendingOutreach?.receiptToken === pendingOutreach.receiptToken) await chrome.storage.local.remove('pendingOutreach');
    banner('Full outreach message filled. Review it and click LinkedIn Send yourself. The full message remains in Outreach Desk.');
  } catch (error) { banner(error.message || 'Could not prepare the invitation note.', true); }
  finally { running = false; }
}
void run().catch(() => {});

})();
