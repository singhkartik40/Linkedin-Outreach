(() => {
if (globalThis.__outreachDeskInviteHelper) return;
globalThis.__outreachDeskInviteHelper = true;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
const vanity = new URL(location.href).searchParams.get('vanityName')?.toLowerCase() || '';
const profileVanity = url => { try { return new URL(url).pathname.match(/^\/in\/([^/]+)/)?.[1].toLowerCase() || ''; } catch { return ''; } };
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
function confirmedByLinkedIn(previous) {
  return [...document.querySelectorAll('[role="alert"], [role="status"], .artdeco-toast-item')].some(element => !previous.has(element) && /(?:invitation|connection request) (?:was |has been )?sent/i.test(clean(element.textContent)));
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
function watchUserSend(editor, note) {
  let watching = false;
  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('button');
    if (watching || !button || clean(button.textContent) !== 'Send' || editorValue(editor) !== note || !visible(editor)) return;
    watching = true;
    const previous = new Set(document.querySelectorAll('[role="alert"], [role="status"], .artdeco-toast-item'));
    const attempt = await chrome.runtime.sendMessage({ type: 'outreach-send-attempt' }).catch(() => null);
    if (!attempt?.ok) return;
    let checks = 0;
    const timer = setInterval(async () => {
      if (confirmedByLinkedIn(previous)) {
        clearInterval(timer);
        const result = await chrome.runtime.sendMessage({ type: 'outreach-delivered' }).catch(() => null);
        if (result?.ok) banner('LinkedIn confirmed the invitation. Outreach Desk is marking this contact done.');
      } else if (++checks >= 30) {
        clearInterval(timer);
        banner('LinkedIn did not show a send confirmation. Check the invitation and use Mark done in Outreach Desk if it was sent.', true);
      }
    }, 500);
  }, true);
}
let running = false;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== 'invite-probe') return;
  sendResponse({ ok: true, page: 'invite' });
  void run();
});
async function run() {
  if (running) return;
  const { pendingOutreach } = await chrome.storage.local.get('pendingOutreach');
  if (!pendingOutreach || pendingOutreach.expiresAt < Date.now() || profileVanity(pendingOutreach.profileUrl) !== vanity) return;
  running = true;
  try {
    let editor = noteEditor();
    if (!editor) {
      const button = await waitFor(addNoteButton);
      if (!button) throw new Error('LinkedIn did not show Add a note for this invitation.');
      button.click();
      editor = await waitFor(noteEditor);
    }
    if (!editor) throw new Error('LinkedIn did not open the invitation note editor.');
    const note = pendingOutreach.message;
    const maximum = Number(editor.getAttribute('maxlength')) || 300;
    if (note.length > maximum) throw new Error(`The note exceeds LinkedIn's ${maximum}-character limit.`);
    fillEditor(editor, note);
    if (editorValue(editor) !== note) throw new Error('LinkedIn did not retain the note.');
    watchUserSend(editor, note);
    await chrome.storage.local.remove('pendingOutreach');
    banner('Full outreach message filled. Review it and click LinkedIn Send yourself. The full message remains in Outreach Desk.');
  } catch (error) { banner(error.message || 'Could not prepare the invitation note.', true); }
  finally { running = false; }
}
run();

})();
