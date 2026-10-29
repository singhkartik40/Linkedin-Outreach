(() => {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const signals = () => [...document.querySelectorAll('[role="alert"], [role="status"], .artdeco-toast-item')];
  const visible = element => !!element?.getClientRects().length;
  const pending = () => [...(document.querySelector('main') || document).querySelectorAll('button, [role="button"]')].some(button => visible(button) && /^pending$/i.test(clean(button.textContent || button.getAttribute('aria-label'))));
  globalThis.outreachWatchSend = ({ editor, kind = 'invitation', onStatus = () => {} }) => {
    let watching = false, finished = false;
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('button, [role="button"]');
      const label = clean(button?.textContent || button?.getAttribute('aria-label'));
      if (watching || finished || !visible(button) || !/^send(?: without a note| invitation| now)?$/i.test(label)) return;
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
          const result = await chrome.runtime.sendMessage({type:'outreach-delivered'}).catch(() => null);
          reporting = false;
          if (result?.ok) { finished = true; stop(); onStatus('Request sent. Outreach Desk will mark it done and update the tracker automatically.'); }
        }
        if (++checks >= 120) { stop(); onStatus('No LinkedIn confirmation was detected. Check the invitation before using Mark done.'); }
      }, 500);
      chrome.runtime.sendMessage({type:'outreach-send-attempt'}).then(result => { approved = !!result?.ok; if (!approved) stop(); }).catch(stop);
    }, true);
  };
})();
