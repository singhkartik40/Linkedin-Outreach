(() => {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const signals = () => [...document.querySelectorAll('[role="alert"], [role="status"], .artdeco-toast-item')];
  const visible = element => !!element?.getClientRects().length;
  async function report(type) {
    try { return await chrome.runtime.sendMessage({ type }); }
    catch { return null; }
  }
  const pending = (root = document.querySelector('main') || document) => [...root.querySelectorAll('button, [role="button"], a, [role="menuitem"]')].some(control => visible(control) && [control.textContent, control.getAttribute?.('aria-label'), control.getAttribute?.('title')].some(label => /^(?:pending(?:$|[,.\s])|(?:invitation|connection request) pending\b|withdraw (?:invitation|connection request)\b)/i.test(clean(label))));
  globalThis.outreachPendingInvitation = pending;
  globalThis.outreachWatchSend = ({ editor, kind = 'invitation', onStatus = () => {} }) => {
    let watching = false, finished = false;
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('button, [role="button"]');
      const label = [button?.getAttribute?.('aria-label'), button?.textContent].map(clean).find(value => /^send(?: without a note| invitation| now| message)?$/i.test(value));
      if (watching || finished || !visible(button) || !label) return;
      const scope = editor?.closest('[role="dialog"], .artdeco-modal, .msg-overlay-conversation-bubble, .msg-form');
      if (scope && !scope.contains(button)) return;
      if (editor && !visible(editor)) return;
      if (!editor && !/without a note/i.test(label) && !location.pathname.startsWith('/preload/custom-invite/')) return;
      const actualMessage = clean(editor?.value ?? editor?.innerText);
      if (kind === 'message' && !actualMessage) return;
      watching = true;
      const before = new Map(signals().map(element => [element, clean(element.textContent)]));
      const wasPending = pending();
      const messageRoot = scope || document;
      const messageCount = () => [...messageRoot.querySelectorAll('.msg-s-event-listitem__body, .msg-s-message-group__messages')].filter(element => clean(element.innerText) === actualMessage).length;
      const previousMessages = messageCount();
      let approved = false, evidence = false, reporting = false, checks = 0;
      const hasEvidence = () => signals().some(element => visible(element) && clean(element.textContent) !== before.get(element) && !/\b(?:not|unable|failed|couldn.t)\b/i.test(clean(element.textContent)) && /(?:invitation|connection request|message) (?:was |has been )?sent\b|\bsent (?:successfully|your invitation)\b/i.test(clean(element.textContent))) || (kind === 'invitation' && !wasPending && pending()) || (kind === 'message' && !clean(editor?.innerText || editor?.value) && messageCount() > previousMessages);
      const observer = new MutationObserver(() => { evidence ||= hasEvidence(); });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label'] });
      const stop = () => { observer.disconnect(); clearInterval(timer); watching = false; };
      const timer = setInterval(async () => {
        evidence ||= hasEvidence();
        if (approved && evidence && !reporting) {
          reporting = true;
          const result = await report('outreach-delivered');
          reporting = false;
          if (result?.ok) { finished = true; stop(); onStatus('Request sent. Outreach Desk will mark it done and update the tracker automatically.'); }
        }
        // A disappearing invitation form alone is insufficient evidence.
        if (approved && !evidence && !wasPending && kind === 'invitation' && checks >= 7 && !visible(button) && (!editor || !visible(editor))) {
          const standalone = location.pathname.startsWith('/preload/custom-invite/');
          const vanity = standalone ? new URLSearchParams(location.search).get('vanityName') : null;
          if ((vanity || /^\/in\/[^/]+\/?$/.test(location.pathname)) && !signals().some(element => visible(element) && clean(element.textContent) !== before.get(element) && /\b(?:not|unable|failed|couldn.t|limit|try again)\b/i.test(clean(element.textContent)))) {
            stop();
            if (vanity) location.assign(`https://www.linkedin.com/in/${encodeURIComponent(vanity)}/`);
            else location.reload();
            return;
          }
        }
        if (++checks >= 240) {
          stop();
          if (approved && !evidence) await report('outreach-unconfirmed');
          onStatus('Delivery is unverified. Check LinkedIn’s Sent invitations before retrying or marking done.');
        }
      }, 250);
      void report('outreach-send-attempt').then(result => { approved = !!result?.ok; if (!approved) stop(); });
    }, true);
  };
})();
