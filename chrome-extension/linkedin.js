(() => {
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
const profileKey = value => {
  try { return new URL(value).pathname.replace(/\/$/, '').toLowerCase(); }
  catch { return ''; }
};
function controls(root = document) {
  return [...root.querySelectorAll('button, [role="button"], a, [role="menuitem"]')].filter(visible);
}
function exactControl(label, root = document) {
  const wanted = label.toLowerCase();
  return controls(root).find(element => clean(element.textContent).toLowerCase() === wanted || clean(element.getAttribute('aria-label')).toLowerCase() === wanted);
}
function connectControl(root = document) {
  return controls(root).find(element => {
    const text = clean(element.textContent).toLowerCase();
    const aria = clean(element.getAttribute('aria-label')).toLowerCase();
    return text === 'connect' || /^invite .+ to connect$/.test(aria);
  });
}
async function waitFor(read, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = read(); if (value) return value; await sleep(250); }
  return null;
}
function fillTextArea(field, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(field, value); else field.value = value;
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.focus();
}
function fillContentEditable(field, value) {
  field.focus();
  document.execCommand('selectAll', false);
  document.execCommand('insertText', false, value);
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
}
function noteEditor(root, existing = new Set()) {
  return [...root.querySelectorAll('textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"]')].find(element => visible(element) && !existing.has(element));
}
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true; }
  catch {
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.documentElement.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  }
}
function showStatus(message, tone = 'ready') {
  document.getElementById('outreach-desk-helper-status')?.remove();
  const banner = document.createElement('div');
  banner.id = 'outreach-desk-helper-status';
  banner.style.cssText = `position:fixed;top:16px;right:16px;z-index:2147483647;max-width:360px;padding:14px 40px 14px 16px;border-radius:10px;background:${tone === 'error' ? '#7f1d1d' : '#0f3d68'};color:white;font:14px/1.45 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.28)`;
  banner.textContent = message;
  const close = document.createElement('button');
  close.textContent = '×'; close.setAttribute('aria-label', 'Close');
  close.style.cssText = 'position:absolute;right:10px;top:7px;border:0;background:transparent;color:white;font-size:22px;cursor:pointer';
  close.onclick = () => banner.remove(); banner.appendChild(close); document.documentElement.appendChild(banner);
}
function watchUserSend(editor, note, kind) {
  globalThis.outreachWatchSend({editor,kind,onStatus:showStatus});
}
async function verifyPendingInvitation() {
  const { outreachSession } = await chrome.storage.local.get('outreachSession');
  if (!outreachSession?.awaitingConfirmation || outreachSession.expiresAt < Date.now() || profileKey(outreachSession.profileUrl) !== profileKey(location.href)) return;
  if (await waitFor(() => exactControl('Pending', document.querySelector('main') || document), 8000)) {
    await chrome.runtime.sendMessage({ type: 'outreach-delivered' }).catch(() => null);
  }
}
async function prepareConnection(pending) {
  const main = await waitFor(() => document.querySelector('main'));
  if (!main) throw new Error('LinkedIn profile controls did not load.');
  if (exactControl('Pending', main)) throw new Error('A connection request is already pending for this profile.');

  await waitFor(() => connectControl(main) || exactControl('Message', main) || exactControl('More', main) || exactControl('Pending', main));
  let connect = connectControl(main);
  if (!connect) {
    const more = controls(main).find(element => clean(element.textContent).toLowerCase() === 'more' || clean(element.getAttribute('aria-label')).toLowerCase().startsWith('more actions'));
    if (more) { more.click(); connect = await waitFor(() => connectControl(document), 4000); }
  }
  if (connect) {
    const existingEditors = new Set([...document.querySelectorAll('textarea, [contenteditable="true"]')].filter(visible));
    connect.click();
    const copied = await copyText(pending.message);
    // LinkedIn's invitation container does not always expose role=dialog or .artdeco-modal.
    const invitation = await waitFor(() => exactControl('Add a note') || exactControl('Send without a note') || noteEditor(document, existingEditors), 6000);
    if (!invitation) {
      const vanity = profileKey(location.href).match(/^\/in\/([^/]+)$/)?.[1] || '';
      if (!vanity) throw new Error('LinkedIn did not expose the connection invitation after Connect. The full message remains available in Outreach Desk.');
      showStatus('Connect did not open a dialog, so Outreach Desk is opening LinkedIn’s invitation page directly.');
      location.assign(`https://www.linkedin.com/preload/custom-invite/?vanityName=${encodeURIComponent(vanity)}`);
      return null;
    }
    const addNote = exactControl('Add a note');
    if (addNote) { addNote.click(); await sleep(250); }
    const editor = await waitFor(() => noteEditor(document, existingEditors), 5000);
    if (!editor) watchUserSend(null, '', 'invitation');
    if (!editor) return copied ? 'Connection dialog opened, but its note editor was not found. The full outreach message is on your clipboard.' : 'Connection dialog opened, but its note editor was not found. Copy the message from Outreach Desk.';
    const note = pending.message;
    watchUserSend(editor, note, 'invitation');
    const maxLength = Number(editor.getAttribute('maxlength')) || 0;
    if (maxLength && note.length > maxLength) return `Connection dialog opened. LinkedIn allows ${maxLength} characters here; the outreach message is ${note.length}. The full message is copied for review.`;
    if (editor instanceof HTMLTextAreaElement) fillTextArea(editor, note);
    else fillContentEditable(editor, note);
    return copied ? 'Full outreach message filled. The full outreach message is copied. Review the note, then click LinkedIn’s Send button.' : 'Full outreach message filled. Review it, then click LinkedIn’s Send button.';
  }

  const messageButton = exactControl('Message', main);
  if (messageButton) {
    messageButton.click();
    const editor = await waitFor(() => [...document.querySelectorAll('[contenteditable="true"][role="textbox"], .msg-form__contenteditable')].find(visible));
    if (!editor) throw new Error('LinkedIn opened messaging but the editor was not found.');
    fillContentEditable(editor, pending.message);
    watchUserSend(editor, pending.message, 'message');
    return 'Message editor filled. Review the recipient and message, then click Send.';
  }
  throw new Error('Connect or Message was not available on this profile.');
}

let running = false;
async function run() {
  if (running) return;
  const { pendingOutreach } = await chrome.storage.local.get('pendingOutreach');
  if (!pendingOutreach || pendingOutreach.expiresAt < Date.now() || profileKey(pendingOutreach.profileUrl) !== profileKey(location.href)) return;
  running = true;
  try {
    const result = await prepareConnection(pendingOutreach);
    if (!result) return;
    await chrome.storage.local.remove('pendingOutreach');
    showStatus(result);
  } catch (error) { showStatus(error.message || 'Could not prepare outreach.', 'error'); }
}
run();
verifyPendingInvitation();
setInterval(run, 1500);

})();
