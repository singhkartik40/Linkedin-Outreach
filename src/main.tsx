import React, { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './minimal.css';
import { OutreachBoard, CityPicker } from './OutreachBoard';

type Fact = { value: string | number | boolean | null; evidence: string };
export type Job = { peopleSearch?: { eligible: boolean; reason: string; ageMinutes: number | null }; id: string; url: string; text: string; createdAt: string; extraction: string; sourceRecency?: string; sourceName?: string; publishedAt?: string; employmentType?: string; facts: Record<string, Fact>; assessment: { status: string; failures: { rule: string; reason: string }[]; unresolved: { rule: string; reason: string }[] } };
export type Contact = { companyLimit?: { blocked: boolean; count: number; reason: string }; employmentVerified?: boolean; currentEmploymentEvidence?: string; contactRole?: string; funding?: { title: string; url: string; reportedAt: string } | null; deletedAt?: string | null; updatedAt?: string; confirmedAt?: string; jobLocation?: string; jobRecency?: string; messageVersions?: { id: string; message: string; replacedAt: string; deletedAt?: string | null }[]; id: string; jobId: string; jobUrl: string; jobTitle: string; company: string; name: string; headline: string; location: string; profileUrl: string; degree: string; connectionState?: string; connectionCheckedAt?: string; relevance: string; evidence: string; message: string; status: string; researchedAt: string; sheetStatus?: string; sheetSyncStatus?: string | null; sheetCheckedAt?: string | null; outreachBlocked?: boolean };
type State = { jobBoardSources?: Record<string, { status: string; syncedAt?: string; count?: number; delay: string }>; discoverySchedule?: { enabled: boolean; nextRunAt: number; lastRunAt: number | null; lastStatus: string; lastAdded: number; leaseUntil: number }; provider: null | { provider: string; model: string; baseUrl: string; hasKey: boolean }; google: { connected: boolean; configured: boolean; readOnly: boolean; writeConfigured: boolean }; spreadsheetId: string; tracker: null | { title: string; rowCount: number; syncedAt: string; tabs: string[]; headers: string[]; missingTabs: string[]; missingHeaders: string[]; schemaValid: boolean }; jobs: Job[]; contacts: Contact[]; events: { id: string; kind: string; message: string; created_at: string }[]; sending: { available: boolean; reason: string }; automation: { autoSync: boolean; desiredSending: string } };
type Page = 'Overview' | 'Outreach' | 'Job research' | 'Tracker' | 'Automation' | 'Settings';
const providerNames: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', nvidia: 'NVIDIA NIM', chutes: 'Chutes AI', compatible: 'OpenAI-compatible' };
const helperVersion = '0.6.5';
const labels: Record<string, string> = { title: 'Job title', company: 'Company', location: 'Location', postedAt: 'Exact posted time', experienceMin: 'Minimum experience (years)', experienceFlexible: 'Experience is flexible', salaryLpa: 'Minimum salary (₹ LPA)', saturdayWork: 'Saturday work', roleCategory: 'Role category', applicationOpen: 'Applications open' };
async function api(path: string, data?: unknown) {
  const response = await fetch(`/api${path}`, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    Overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    'Job research': <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v3h4v-3"/></>,
    Outreach: <><path d="M4 20v-2a4 4 0 0 1 4-4h4"/><circle cx="10" cy="7" r="4"/><path d="m15 11 2 2 4-4M16 18h5"/></>,
    Tracker: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12M3 15h18"/></>,
    Automation: <><path d="m13 2-9 12h7l-1 8 10-12h-7z"/></>,
    Settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    link: <><path d="m10 13 4-4m-6 1-2 2a4 4 0 0 0 6 6l2-2m-4-8 2-2a4 4 0 0 1 6 6l-2 2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.link}</svg>;
}
function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function App() {
  const [state, setState] = useState<State | null>(null), [page, setPage] = useState<Page>('Overview');
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null), [busy, setBusy] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null), [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [jobSource, setJobSource] = useState('All sources'), [jobLocation, setJobLocation] = useState(''), [jobAge, setJobAge] = useState('72');
  const [filter, setFilter] = useState('All jobs'), [search, setSearch] = useState('');
  const [discoveryMode, setDiscoveryMode] = useState<'team' | 'founders'>('team');
  const [runningAudience, setRunningAudience] = useState('');
  const [queuedAudience, setQueuedAudience] = useState<'team' | 'founders' | null>(null);
  const isFounder = (contact: Contact) => contact.contactRole === 'founder' || /\b(?:co[ -]?)?founder\b/i.test(contact.headline);
  const [handoff, setHandoff] = useState<Contact | null>(null);
  const outreachReceipts = useRef<Map<string, string>>(new Map());
  const confirmingDeliveries = useRef(new Set<string>());
  function saveReceipts() { try { sessionStorage.setItem('outreach-send-receipts', JSON.stringify([...outreachReceipts.current])); } catch {} }
  const [cities, setCities] = useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem('outreach-cities') || '["India"]'); return Array.isArray(value) && value.length && value.every(city => typeof city === 'string' && city.length > 0 && city.length <= 80) ? value.slice(0, 8) : ['India']; } catch { return ['India']; } });
  function changeCities(value: string[]) { setCities(value); try { localStorage.setItem('outreach-cities', JSON.stringify(value)); } catch {} }
  const discoveryRunId = useRef<string | null>(null), autoRetryAfter = useRef(0);
  const [peopleScanning, setPeopleScanning] = useState(false), scanTimer = useRef<number | null>(null), scanActive = useRef(false);
  useEffect(() => { if (!peopleScanning && queuedAudience) { const mode = queuedAudience; setQueuedAudience(null); void scanPeople(false, false, undefined, false, mode); } }, [peopleScanning, queuedAudience]);
  function findAudience(replace = false) { if (peopleScanning) { setQueuedAudience(discoveryMode); return; } void scanPeople(replace); }
  const [scanProgress, setScanProgress] = useState<{ percent: number; detail: string; jobsFound: number; peopleFound: number } | null>(null);
  const scanImports = useRef<Promise<void>>(Promise.resolve()), scanAdded = useRef(0), scanReplaced = useRef(false), scanImportError = useRef('');
  const scanFounderAdded = useRef(0), scanWarnings = useRef<Set<string>>(new Set());
  async function refresh() { setState(await api('/state')); }
  async function finishDiscovery(status: string, added = 0) {
    const runId = discoveryRunId.current; discoveryRunId.current = null;
    if (runId) await api('/discovery-schedule', {action:'finish', runId, status, added}).catch(() => {});
  }
  useEffect(() => {
    if (!state?.discoverySchedule?.enabled || peopleScanning) return;
    const timer = window.setTimeout(() => { void scanPeople(false, true); }, Math.max(1000, Math.max(state.discoverySchedule.nextRunAt, autoRetryAfter.current) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state?.discoverySchedule?.enabled, state?.discoverySchedule?.nextRunAt, peopleScanning]);

  useEffect(() => { const sync = () => window.postMessage({source:'outreach-desk',type:'sync-deliveries'},window.location.origin); const timer = window.setInterval(sync,10000); sync(); return () => window.clearInterval(timer); }, []);
  useEffect(() => { refresh().catch(e => setNotice({ text: e.message, error: true })); const timer = setInterval(() => refresh().catch(() => {}), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { try { const saved = JSON.parse(sessionStorage.getItem('outreach-send-receipts') || '[]'); if (Array.isArray(saved)) outreachReceipts.current = new Map(saved.filter(row => Array.isArray(row) && /^[\w-]{20,}$/.test(row[0]) && /^[\w-]{20,}$/.test(row[1]))); } catch {} }, []);
  useEffect(() => {
    async function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'outreach-desk-helper') return;
      if (event.data?.type === 'outreach-delivered') {
        const contactId = String(event.data.contactId || '');
        const receiptToken = outreachReceipts.current.get(contactId) || String(event.data.receiptToken || '');
        if (!/^[\w-]{20,}$/.test(receiptToken) || confirmingDeliveries.current.has(contactId)) return;
        confirmingDeliveries.current.add(contactId);
        try {
          const result = await api(`/contacts/${contactId}/confirm-from-helper`, { receiptToken });
          outreachReceipts.current.delete(contactId); saveReceipts();
          window.postMessage({source:'outreach-desk',type:'ack-delivery',payload:{contactId,receiptToken}},window.location.origin);
          await refresh();
          setHandoff(null);
          setNotice({ text: result.sheetUpdated ? 'LinkedIn send confirmed. Contact marked done and Sheet row verified.' : `LinkedIn send confirmed. Contact marked done locally; Sheet update pending: ${result.error}`, error: !result.sheetUpdated });
        } catch (error) { setNotice({ text: `LinkedIn reported a send, but automatic completion failed: ${(error as Error).message}. The helper will retry while this dashboard is open.`, error: true }); } finally { confirmingDeliveries.current.delete(contactId); }
        return;
      }
      if (event.data?.type === 'people-scan-progress') { if (scanActive.current) { setScanProgress(event.data.payload); armScanTimeout(); } return; }
      if (event.data?.type === 'people-scan-batch') {
        if (!scanActive.current || !event.data.payload?.people?.length) return;
        const payload = event.data.payload;
        armScanTimeout();
        scanImports.current = scanImports.current.then(async () => {
          if (!payload.independentFounders && !payload.targeted) await api('/jobs/discovered', { jobs: payload.jobs || [], cities: payload.cities || ['India'] });
          const result = await api(payload.independentFounders ? '/founders/import' : '/people/import', { ...payload, replace: !!payload.replace && !scanReplaced.current });
          if (!payload.independentFounders) scanReplaced.current = true;
          scanAdded.current += result.added;
          scanFounderAdded.current += result.addedFounders || 0;
          for (const warning of result.warnings || []) scanWarnings.current.add(warning);
          await refresh();
        }).catch((error: Error) => { scanImportError.current = error.message; });
        return;
      }
      if (event.data?.type !== 'people-scan-results') return;
      if (!scanActive.current) return;
      scanActive.current = false;
      if (scanTimer.current) window.clearTimeout(scanTimer.current);
      try {
        await scanImports.current;
        if (event.data.payload?.error) throw new Error(event.data.payload.error);
        const jobsResult = await api('/jobs/discovered', { jobs: event.data.payload.jobs || [], cities: event.data.payload.cities || ['India'] });
        
        const result = await api('/people/import', { ...event.data.payload, replace: !!event.data.payload.replace && !scanReplaced.current });
        const founders = await api('/founders/import', { people: event.data.payload.founders || [] });
        result.added += scanAdded.current + founders.added;
        result.addedFounders = (result.addedFounders || 0) + scanFounderAdded.current + founders.added;
        for (const warning of result.warnings || []) scanWarnings.current.add(warning);
        if (scanImportError.current && !result.added) throw new Error(scanImportError.current);
        await finishDiscovery(result.added ? 'Completed' : 'No new verified matches', result.added);
        await refresh();
        const text = result.added === 0
          ? `Checked ${jobsResult.fresh} recent jobs but found no new matching people. People already saved in your list are skipped.`
          : `Scan complete: checked ${jobsResult.fresh} recent jobs and added ${result.added} new people${event.data.payload.mode === 'all' ? ` (${result.added - result.addedFounders} designers/HR, ${result.addedFounders} founders)` : result.added < 20 ? ' (fewer than 20 matches were available)' : ''}. ${result.total} contacts are saved.`;
        if (event.data.payload.targeted) { setPage('Outreach'); setDiscoveryMode('team'); }
        for (const warning of event.data.payload.warnings || []) scanWarnings.current.add(warning);
        const skipped = event.data.payload.warnings?.length || 0;
        setNotice({ text: `${text}${skipped ? ` ${skipped} searches could not be checked; this scan is partial.` : ''}${scanWarnings.current.size ? ` ${[...scanWarnings.current].join(' ')}` : ''}`, error: result.added === 0 || skipped > 0 || scanWarnings.current.size > 0 });
      } catch (error) { await finishDiscovery((error as Error).message); setNotice({ text: (error as Error).message, error: true }); await refresh(); }
      finally { setPeopleScanning(false); setScanProgress(null); }
    }
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); if (scanTimer.current) window.clearTimeout(scanTimer.current); };
  }, []);
  async function run(name: string, action: () => Promise<void>, success?: string) {
    setBusy(name); setNotice(null);
    try { await action(); await refresh(); if (success) setNotice({ text: success, error: false }); }
    catch (e) { setNotice({ text: (e as Error).message, error: true }); }
    finally { setBusy(''); }
  }
  const selected = state?.jobs.find(job => job.id === selectedId);
  const jobs = state?.jobs.filter(job => (filter === 'All jobs' || (filter === 'Ready for outreach' ? job.peopleSearch?.eligible : job.assessment.status === filter)) && (jobSource === 'All sources' || (job.sourceName || 'LinkedIn') === jobSource) && String(job.facts.location?.value || '').toLowerCase().includes(jobLocation.toLowerCase()) && (jobAge === 'unknown' ? job.peopleSearch?.ageMinutes == null : job.peopleSearch?.ageMinutes != null && job.peopleSearch.ageMinutes < Number(jobAge) * 60) && `${job.facts.title?.value || ''} ${job.facts.company?.value || ''} ${job.url}`.toLowerCase().includes(search.toLowerCase())) || [];
  const activeContacts = state?.contacts.filter(contact => !contact.companyLimit?.blocked && !contact.deletedAt && !['Send confirmed', 'Sent', 'Skipped'].includes(contact.status)) || [];
  const completedContacts = state?.contacts.filter(contact => !contact.companyLimit?.blocked && !contact.deletedAt && ['Send confirmed', 'Sent'].includes(contact.status)) || [];
  const go = (value: Page) => { setPage(value); setSelectedId(null); setSelectedContactId(null); setNotice(null); };
  async function refreshBoard() { await run('board', async () => { const result = await api('/job-board/sync', {}); const failed = Object.values(result.sources || {}).filter((source: any) => source.status !== 'Connected'); setNotice({ text: `Job board refreshed: ${result.added} new roles.${failed.length ? ` ${failed.length} feed(s) unavailable; see source status below.` : ' Feeds keep their hourly or six-hour source cache.'}`, error: failed.length > 0 }); }); }
  useEffect(() => { if (page === 'Job research') void refreshBoard(); }, [page]);
  async function prepareOutreach(contact: Contact) {
    if (contact.outreachBlocked) { setNotice({ text: contact.sheetStatus === 'Tracker not connected' ? 'Refresh the public tracker before outreach.' : 'This person already appears in the tracker.', error: true }); return; }
    setHandoff(contact);
    // Clipboard writes begin in the click gesture; the Chrome helper opens the profile tab.
    const copied = navigator.clipboard?.writeText(contact.message).then(() => true, () => false) ?? Promise.resolve(false);
    let receiptToken: string;
    try { ({ receiptToken } = await api(`/contacts/${contact.id}/prepare`, {})); }
    catch (error) { setNotice({ text: (error as Error).message, error: true }); return; }
    outreachReceipts.current.set(contact.id, receiptToken);
    saveReceipts();
    const requestId = crypto.randomUUID();
    const helper = new Promise<{ ok: boolean; error?: string }>(resolve => {
      const timer = window.setTimeout(() => { window.removeEventListener('message', listener); resolve({ ok: false, error: 'Chrome helper did not respond.' }); }, 1800);
      function listener(event: MessageEvent) {
        if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'outreach-desk-helper' || event.data?.requestId !== requestId) return;
        window.clearTimeout(timer); window.removeEventListener('message', listener); resolve({ ok: !!event.data.ok, error: event.data.error });
      }
      window.addEventListener('message', listener);
    });
    window.postMessage({ source: 'outreach-desk', type: 'prepare-outreach', requestId, payload: { contactId: contact.id, receiptToken, profileUrl: contact.profileUrl, message: contact.message, contactName: contact.name } }, window.location.origin);
    const [result, didCopy] = await Promise.all([helper, copied]);
    if (!result.ok) { outreachReceipts.current.delete(contact.id); saveReceipts(); }
    setNotice({ text: `${result.ok ? 'LinkedIn profile opened by the Chrome helper.' : 'Chrome helper could not open LinkedIn; use Open profile below.'} ${didCopy ? 'Full outreach message copied.' : 'Use Copy full message below.'} ${result.ok ? 'The helper is preparing the connection dialog. A confirmed LinkedIn send will mark this contact done automatically.' : result.error || ''}`, error: !didCopy || !result.ok });
  }
  async function markDone(contact: Contact) {
    setBusy('done'); setNotice(null);
    try {
      const result = await api(`/contacts/${contact.id}/done`, {});
      await refresh();
      setNotice(result.sheetUpdated ? { text: `${contact.name} moved to Completed and Master row ${result.rowNumber} was updated and verified.`, error: false } : { text: `${contact.name} moved to Completed. Sheet update pending: ${result.error}`, error: true });
      if (handoff?.id === contact.id) setHandoff(null);
    } catch (error) { await refresh().catch(() => {}); setNotice({ text: (error as Error).message, error: true }); }
    finally { setBusy(''); }
  }
  async function retrySheet(contact: Contact) {
    setBusy('sheet'); setNotice(null);
    try {
      const result = await api(`/contacts/${contact.id}/sync-sheet`, {});
      await refresh();
      setNotice(result.sheetUpdated ? { text: `${contact.name} was verified in Master row ${result.rowNumber}.`, error: false } : { text: `Sheet update pending: ${result.error}`, error: true });
    } catch (error) { setNotice({ text: (error as Error).message, error: true }); }
    finally { setBusy(''); }
  }
  async function scanPeople(replace: boolean, automatic = false, target?: Job, freshJobs = false, audience?: 'team' | 'founders') {
    if (!state || scanActive.current || peopleScanning) return;
    function requestHelper(type: string, payload: unknown) {
      const requestId = crypto.randomUUID();
      const response = new Promise<{ ok: boolean; error?: string; version?: string }>(resolve => {
        const timer = window.setTimeout(() => { window.removeEventListener('message', listener); resolve({ ok: false, error: 'Chrome helper did not respond.' }); }, 1800);
        function listener(event: MessageEvent) {
          if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'outreach-desk-helper' || event.data?.requestId !== requestId) return;
          window.clearTimeout(timer); window.removeEventListener('message', listener); resolve({ ok: !!event.data.ok, error: event.data.error, version: event.data.version });
        }
        window.addEventListener('message', listener);
      });
      window.postMessage({ source: 'outreach-desk', type, requestId, payload }, window.location.origin);
      return response;
    }
    setRunningAudience(automatic ? 'all' : freshJobs || target ? 'team' : audience || discoveryMode); setPeopleScanning(true); setScanProgress({ percent: 2, detail: 'Checking Chrome helper', jobsFound: 0, peopleFound: 0 }); setNotice(null);
    const ping = await requestHelper('ping-helper', {});
    if (!ping.ok || ping.version !== helperVersion) { if (automatic) autoRetryAfter.current = Date.now() + 60000; await finishDiscovery('Helper needs reloading'); await refresh(); setPeopleScanning(false); setScanProgress(null); setNotice({ text: 'The Chrome helper needs to be reloaded. Open chrome://extensions, reload Outreach Desk LinkedIn Helper, then refresh this page.', error: true }); return; }
    let claim;
    try { claim = await api('/discovery-schedule', {action:'claim', automatic}); } catch (error) { autoRetryAfter.current = Date.now() + 60000; setPeopleScanning(false); setScanProgress(null); setNotice({text:(error as Error).message,error:true}); return; }
    if (!claim?.claimed) { autoRetryAfter.current = Date.now() + 60000; setPeopleScanning(false); setScanProgress(null); if (!automatic) setNotice({text:'A scan is already running in another dashboard tab. Please wait for it to finish.',error:true}); return; }
    discoveryRunId.current = claim.runId;
    scanImports.current = Promise.resolve(); scanAdded.current = 0; scanReplaced.current = false; scanImportError.current = '';
    scanFounderAdded.current = 0; scanWarnings.current = new Set();
    let targetJob;
    if (target) { try { targetJob = (await api(`/jobs/${target.id}/people-search`, {})).job; } catch (error) { await finishDiscovery((error as Error).message); setPeopleScanning(false); setScanProgress(null); setNotice({ text: (error as Error).message, error: true }); return; } }
    scanActive.current = true; setScanProgress({ percent: 3, detail: 'Opening recent LinkedIn jobs', jobsFound: 0, peopleFound: 0 });
    const metroCities = ['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Gurugram', 'Noida'];
    const scanCities = freshJobs ? ['India'] : cities.includes('India') ? ['India', ...metroCities] : cities;
    const result = await requestHelper('scan-people', { limit: target ? 4 : 20, job: targetJob, mode: automatic ? 'all' : target || freshJobs ? 'team' : audience || discoveryMode, cities: scanCities, replace, excludedProfiles: state.contacts.filter(contact => contact.employmentVerified !== false || contact.status !== 'Draft ready' || contact.deletedAt).map(contact => contact.profileUrl) });
    if (!result.ok) { await finishDiscovery(result.error || 'Could not start scan'); await refresh(); scanActive.current = false; setPeopleScanning(false); setScanProgress(null); setNotice({ text: result.error || 'Chrome helper could not start the people scan.', error: true }); return; }
    if (target || freshJobs) { setPage('Outreach'); setDiscoveryMode('team'); }
    armScanTimeout();
  }
  function armScanTimeout() {
    if (!scanActive.current) return;
    if (scanTimer.current) window.clearTimeout(scanTimer.current);
    scanTimer.current = window.setTimeout(() => { void finishDiscovery('Timed out: check LinkedIn tab').then(refresh); scanActive.current = false; setPeopleScanning(false); setScanProgress(null); setNotice({ text: 'LinkedIn did not report scan progress for 3 minutes. Check the scan tab for a sign-in prompt, then retry.', error: true }); }, 180000);
  }
  return <div className="app">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); go('Overview'); }}><span className="brand-mark">o<span>↗</span></span><span>outreach<span className="brand-sub">DESK</span></span></a>
      <div className="workspace"><span className="avatar">KS</span><div>Kartik’s workspace<small>Personal · Local</small></div><span className="workspace-dot"/></div>
      
      <nav aria-label="Main navigation">{(['Overview', 'Outreach', 'Job research', 'Tracker', 'Automation', 'Settings'] as Page[]).map(item => <button key={item} className={page === item ? 'nav-item active' : 'nav-item'} onClick={() => go(item)} aria-current={page === item ? 'page' : undefined}><Icon name={item}/>{item}{item === 'Outreach' && !!state?.contacts.length && <span className="nav-count">{state.contacts.length}</span>}{item === 'Job research' && !!state?.jobs.length && <span className="nav-count">{state.jobs.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><span className="local-dot"/> Running on your computer<p>Private workspace</p><span className="version">LOCAL BUILD · v0.6.5</span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><span>Workspace <span className="slash">/</span> <strong>{page}</strong></span><div><span className="timezone">India · IST</span><span className="mini-avatar">KS</span></div></header>
    <main>
      {notice && <div className={`notice ${notice.error ? 'error' : 'success'}`} role={notice.error ? 'alert' : 'status'}>{notice.text}<button aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}
      {handoff && <section className="handoff-panel" aria-label="Outreach handoff"><div><strong>Outreach for {handoff.name}</strong><p>Keep the full message ready while you review the LinkedIn connection dialog.</p></div><p><strong>Connection note ({handoff.message.length}/290):</strong> {handoff.message}</p><textarea readOnly aria-label="Full outreach message to copy" value={handoff.message} onFocus={event => event.currentTarget.select()}/><div className="handoff-actions"><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(handoff.message); setNotice({ text: 'Outreach message copied.', error: false }); } catch { setNotice({ text: 'Clipboard access was blocked. Select the message above and press Ctrl+C.', error: true }); } }}>Copy full message</button><a className="button primary" href={handoff.profileUrl} target="_blank" rel="noreferrer">Open profile ↗</a><button className="text-button" onClick={() => setHandoff(null)}>Close</button></div><p className="field-help">After LinkedIn confirms the send, the contact moves to Completed automatically. If LinkedIn does not expose a confirmation, use Mark done after checking the send yourself.</p></section>}
      {!state ? <section className="loading"><h1>Opening your workspace…</h1><p>Connecting to the local server.</p><button className="button secondary" onClick={() => run('retry', refresh)}>Retry connection</button></section> : <>
      {page === 'Overview' && <>
        <div className="page-heading"><div><div className="eyebrow">FROM OPEN ROLE TO REAL CONVERSATION</div><h1>Find the right person.<br/>Send a relevant message.</h1><p>Recent jobs are the signal. Thoughtful outreach is the outcome.</p></div><button className="button primary" onClick={() => go('Outreach')}><Icon name="arrow" size={17}/> Open outreach queue</button></div>
        <section className="overview-stats" aria-label="Outreach summary">{[['Contacts ready', activeContacts.length, 'Matched to a current role'], ['Marked done', completedContacts.length, 'Awaiting or verified in Sheet'], ['Jobs scanned', state.jobs.length, 'Across your job sources'], ['Tracker records', state.tracker?.rowCount ?? '—', state.tracker ? 'From your last Sheet refresh' : 'Connect your Google Sheet']].map(([label, count, help]) => <div key={label}><span>{label}</span><strong>{count}</strong><small>{help}</small></div>)}</section>
        <div className="overview-grid"><section><div className="section-heading"><h2>People ready for outreach</h2><button className="text-button" onClick={() => go('Outreach')}>View queue <Icon name="arrow" size={16}/></button></div>{activeContacts.length ? <ContactList contacts={activeContacts.slice(0, 4)} open={id => { go('Outreach'); setSelectedContactId(id); }} send={prepareOutreach} done={markDone}/>: <div className="empty-research"><div className="paper-illustration"><span/><span/><span/><div>↗</div></div><h3>Contacts will appear here.</h3><p>We scan recent jobs, find relevant people at the organization,<br className="desktop-break"/> and prepare a message grounded in the role.</p><button className="button secondary" onClick={() => go('Job research')}>Start with recent jobs <Icon name="arrow" size={16}/></button><small>Job contacts and startup founders, with source links.</small></div>}</section>
        <section className="setup-panel"><div className="eyebrow">OUTREACH FLOW</div><h2>Move from signal to send.</h2><p>Each stage keeps its source and status.</p><SetupStep n="01" title="Scan recent jobs" detail={state.jobs.length ? `${state.jobs.length} visible listings reviewed` : 'Keep LinkedIn open and ask Codex to refresh.'} done={state.jobs.length > 0} action={() => go('Job research')}/><SetupStep n="02" title="Find matching people" detail={state.contacts.length ? `${state.contacts.length} relevant contacts found` : 'Recruiters, hiring managers, and design leaders.'} done={state.contacts.length > 0} action={() => go('Outreach')}/><SetupStep n="03" title="Review and send" detail="Personalized drafts · remote browser delivery" done={state.contacts.some(c => c.status === 'Sent')} action={() => go('Outreach')}/><div className="setup-footnote">Every send remains tied to its job, contact evidence, message, and delivery status.</div></section></div>

      </>}
      {page === 'Outreach' && <>
        <PageHeading eyebrow="OUTREACH QUEUE" title="Outreach" description="Find designers and HR from recent jobs, plus startup founders discovered through Google and checked on LinkedIn." action={<div className="heading-actions"><Badge tone="blue">{activeContacts.filter(contact => isFounder(contact) === (discoveryMode === 'founders')).length} drafts ready</Badge><button className="button primary" disabled={peopleScanning && (runningAudience === discoveryMode || runningAudience === 'all' || queuedAudience === discoveryMode)} onClick={() => findAudience()}><Icon name="plus" size={16}/>{peopleScanning ? (queuedAudience === discoveryMode ? 'Search queued' : runningAudience === discoveryMode || runningAudience === 'all' ? 'Scanning LinkedIn…' : 'Queue this search') : (discoveryMode === 'founders' ? 'Find startup founders' : 'Find 20 new people')}</button><button className="button secondary" disabled={peopleScanning} onClick={() => findAudience(true)}>Find more people</button><button className="button secondary" disabled={!!busy} onClick={() => run('sync', async () => { await api('/tracker/sync', {}); }, 'Tracker refreshed. Completed contacts were checked against your Sheet updates.')}>Refresh tracker</button></div>}/>
        {peopleScanning && scanProgress && <section className="scan-progress" role="status" aria-live="polite"><div><strong>{scanProgress.detail}</strong><span>{scanProgress.percent}%</span></div><progress max="100" value={scanProgress.percent}/><small>{scanProgress.jobsFound} job cards checked · {scanProgress.peopleFound} candidates found · {runningAudience === 'founders' ? 'target up to 20 founders' : runningAudience === 'team' ? 'target up to 20 designers/HR' : 'target up to 20 designers/HR plus 20 founders'}</small></section>}
        <section className="discovery-console" aria-label="Discovery schedule">
          <div><h2>{state.discoverySchedule?.enabled ? 'Auto-scan every hour' : 'Discovery is paused.'}</h2><small>Runs while this dashboard is open in Chrome.</small></div>
          <dl><div><dt>Next scan</dt><dd>{state.discoverySchedule?.enabled ? new Date(state.discoverySchedule.nextRunAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Paused'}</dd></div><div><dt>Last result</dt><dd>{state.discoverySchedule?.lastStatus || 'Not run yet'}</dd></div><div><dt>New people last run</dt><dd>{state.discoverySchedule?.lastAdded || 0}</dd></div></dl>
          <button className="button secondary" disabled={!!busy} onClick={() => run('schedule', async () => { await api('/discovery-schedule', {enabled: !state.discoverySchedule?.enabled}); })}>{state.discoverySchedule?.enabled ? 'Pause auto-scan' : 'Enable auto-scan'}</button>
        </section>
        <section className="founder-discovery" aria-label="Discovery audience">
          <div className="city-options"><button type="button" aria-pressed={discoveryMode === 'team'} onClick={() => setDiscoveryMode('team')}>Designers & HR</button><button type="button" aria-pressed={discoveryMode === 'founders'} onClick={() => setDiscoveryMode('founders')}>Founders & co-founders</button></div>
          
          <p>{discoveryMode === 'founders' ? 'Google → startups → LinkedIn founders. Current roles checked; no job opening required.' : '2 designers + 2 HR contacts per company. Founder discovery runs separately on Google.'}</p>
        </section>
        {discoveryMode === 'team' && <CityPicker cities={cities} change={changeCities} disabled={peopleScanning}/>}
        <OutreachBoard key={discoveryMode} contacts={state.contacts.filter(contact => isFounder(contact) === (discoveryMode === 'founders'))} jobs={state.jobs} initialId={selectedContactId} send={prepareOutreach} done={markDone} retry={retrySheet} save={async (contact, input) => { await api(`/contacts/${contact.id}`, input); await refresh(); }} action={async (contact, input) => { await api(`/contacts/${contact.id}/actions`, input); await refresh(); }}/>
      </>}
      {page === 'Job research' && <>
        <PageHeading eyebrow="JOB BOARD" title={selected ? 'Look beyond the listing.' : 'Your next role. One workspace.'} description="India only. Jobicy refreshes hourly; Remotive every 6 hours while the service runs. LinkedIn scans run hourly with this dashboard open in signed-in Chrome; coverage is limited to visible search results, not every LinkedIn job." action={<div className="heading-actions"><button className="button primary" disabled={!!busy} onClick={refreshBoard}>{busy === 'board' ? 'Refreshing…' : 'Refresh job feeds'}</button><button className="button secondary" disabled={peopleScanning} onClick={() => scanPeople(false, false, undefined, true)}>Scan recent LinkedIn jobs</button><a className="button secondary" href="https://www.linkedin.com/jobs/search/?keywords=UX%20Designer&location=India&f_TPR=r86400&f_JT=F" target="_blank" rel="noreferrer">Open LinkedIn ↗</a></div>}/>
        <div className="board-sources"><span>LinkedIn · via Chrome scan</span>{Object.entries(state.jobBoardSources || {}).map(([name, source]) => <span key={name} title={source.delay}><strong>{name}</strong> · {source.status} · {source.syncedAt ? new Date(source.syncedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Not checked'}<small>{source.delay}</small></span>)}</div>
        {selected ? <><JobPeopleAction job={selected} scanning={peopleScanning} find={job => scanPeople(false, false, job)}/><JobDetail key={selected.id} job={selected} busy={!!busy} back={() => setSelectedId(null)} save={facts => run('facts', async () => { await api(`/jobs/${selected.id}/facts`, { facts }); }, 'Facts saved. Values without an exact source quote remain unresolved.')}/></> : <>
          <div className="board-filters"><label>Search roles or companies<input aria-label="Search jobs" placeholder="Product designer, company…" value={search} onChange={e => setSearch(e.target.value)}/></label><label>Source<select value={jobSource} onChange={e => setJobSource(e.target.value)}>{['All sources','LinkedIn','Jobicy','Remotive'].map(name => <option key={name}>{name}</option>)}</select></label><label>Location<input placeholder="India, Bengaluru, Mumbai…" value={jobLocation} onChange={e => setJobLocation(e.target.value)}/></label><label>Posted<select aria-label="Posted" value={jobAge} onChange={e => setJobAge(e.target.value)}><option value="24">Past 24 hours</option><option value="48">Past 48 hours</option><option value="72">Past 3 days</option><option value="unknown">Date needs verification</option></select></label></div>
          <div className="list-toolbar"><div className="tabs" aria-label="Job status filter">{['All jobs','Ready for outreach','Eligible','To verify','Excluded'].map(item => <button className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><small>{jobs.length} roles · automatic feed refresh every hour</small></div>
          {jobs.length ? <JobList jobs={jobs} open={setSelectedId} contacts={state.contacts} scanning={peopleScanning} find={job => scanPeople(false, false, job)}/> : <div className="plain-empty"><h2>No jobs match this view.</h2><p>Refresh jobs or adjust the source, location and date filters. LinkedIn listings arrive from your Chrome scans.</p></div>}
        </>}
      </>}
      {page === 'Settings' && <><PageHeading eyebrow="CONNECTIONS" title="Your AI. Your choice." description="Choose a provider and use your own API key. Outreach Desk selects the model automatically."/><ProviderForm state={state} busy={!!busy} run={run}/></>}
      {page === 'Tracker' && <><PageHeading eyebrow="GOOGLE SHEETS" title="Keep your history close." description="Read your tracker and update the matching Master row after confirmed outreach." action={<Badge tone={state.google.writeConfigured ? 'green' : 'amber'}>{state.google.writeConfigured ? 'Automatic updates ready' : 'Sheet writes need setup'}</Badge>}/><TrackerForm state={state} busy={!!busy} run={run}/></>}
      {page === 'Automation' && <><PageHeading eyebrow="WORKFLOW" title="Less upkeep. More control." description="Automate the repeatable work, with clear boundaries around delivery."/><AutomationForm state={state} busy={!!busy} run={run}/></>}
      {page !== 'Job research' && page !== 'Settings' && state.events.length > 0 && <section className="activity"><div className="section-heading"><h2>Recent activity</h2><span className="muted">Saved locally</span></div>{state.events.slice(0, 5).map(event => <div key={event.id} className="event"><span className="event-dot"/><span>{event.message}</span><time>{new Date(event.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</time></div>)}</section>}
      </>}
      <footer><span>OUTREACH DESK</span><span>Thoughtful outreach starts with good research.</span></footer>
    </main></div>
  </div>;
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-heading compact"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function SetupStep({ n, title, detail, done, action }: { n: string; title: string; detail: string; done: boolean; action: () => void }) { return <button className="setup-step" onClick={action}><span className={done ? 'step-number done' : 'step-number'}>{done ? <Icon name="check" size={15}/> : n}</span><span><strong>{title}</strong><small>{detail}</small></span><Icon name="arrow" size={17}/></button>; }
function JobPeopleAction({ job, scanning, find }: { job: Job; scanning: boolean; find: (job: Job) => void }) {
  const ready = job.peopleSearch?.eligible === true;
  return <div className="job-people-action"><button className="button primary" disabled={scanning || !ready} onClick={() => find(job)}>Find 4 people for this job</button>{!ready && <small>{job.peopleSearch?.reason || 'Checking outreach eligibility…'}</small>}</div>;
}
function JobList({ jobs, open, contacts, scanning, find }: { jobs: Job[]; open: (id: string) => void; contacts: Contact[]; scanning: boolean; find: (job: Job) => void }) {
  return <div className="job-list">{jobs.map(job => {
    const count = contacts.filter(contact => contact.jobId === job.id && !contact.deletedAt).length;
    return <article className="job-row board-job" key={job.id}><button className="job-open" onClick={() => open(job.id)}><span className="company-initial">{String(job.facts.company?.value || '?').slice(0,1)}</span><span className="job-title"><strong>{String(job.facts.title?.value || 'Unreviewed job post')}</strong><small>{String(job.facts.company?.value || new URL(job.url).hostname)} · {String(job.facts.location?.value || 'Location to verify')}</small><small>{job.sourceName || 'LinkedIn'} · {job.peopleSearch?.ageMinutes != null ? `Posted about ${job.peopleSearch.ageMinutes < 60 ? `${Math.floor(job.peopleSearch.ageMinutes)}m` : `${Math.floor(job.peopleSearch.ageMinutes / 60)}h`} ago` : 'Posting time to verify'} · {job.employmentType || 'Review employment details'} · {count} contacts saved</small></span><Badge tone={job.assessment.status === 'Eligible' ? 'green' : job.assessment.status === 'Excluded' ? 'red' : 'amber'}>{job.assessment.status}</Badge></button><div className="board-job-actions"><JobPeopleAction job={job} scanning={scanning} find={find}/><a className="job-direct-link" href={job.url} target="_blank" rel="noopener noreferrer">{new URL(job.url).hostname.endsWith('linkedin.com') ? 'Open on LinkedIn' : `Open on ${job.sourceName || 'job board'}`} ↗</a></div></article>;
  })}</div>;
}
function ContactList({ contacts, open, send, done }: { contacts: Contact[]; open: (id: string) => void; send: (contact: Contact) => void; done: (contact: Contact) => void }) { return <div className="outreach-table-wrap"><table className="outreach-table"><thead><tr><th>Company</th><th>Person</th><th>Profile</th><th>Outreach message</th><th>Connection</th><th>Sheet check</th><th>Action</th></tr></thead><tbody>{contacts.map(contact => <tr key={contact.id}><td><strong>{contact.company}</strong><small>{contact.jobTitle}</small></td><td><button className="person-link" onClick={() => open(contact.id)}>{contact.name}</button><small>{contact.headline}</small></td><td><a href={contact.profileUrl} target="_blank" rel="noreferrer">Open profile ↗</a></td><td><span className="message-cell">{contact.message}</span><small>{contact.message.length} / 290 characters</small></td><td><Badge tone="amber">{contact.connectionState || `${contact.degree} degree`}</Badge><small>{contact.degree} degree · checked on LinkedIn</small></td><td><Badge tone={contact.sheetStatus === 'Clear to contact' ? 'green' : 'amber'}>{contact.sheetStatus || 'Not checked'}</Badge><small>{contact.sheetCheckedAt ? `Synced ${new Date(contact.sheetCheckedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Refresh Google Sheet first'}</small></td><td><button className="button primary table-action" disabled={contact.outreachBlocked} onClick={() => send(contact)}>Send outreach</button><label className="done-check"><input type="checkbox" checked={false} onChange={() => done(contact)}/> Mark done</label></td></tr>)}</tbody></table></div>; }

function ImportForm({ busy, hasProvider, submit, cancel }: { busy: boolean; hasProvider: boolean; submit: (data: unknown) => void; cancel: () => void }) {
  const [url, setUrl] = useState(''), [text, setText] = useState(''), [mode, setMode] = useState(hasProvider ? 'ai' : 'manual');
  return <form className="form-panel import-form" onSubmit={e => { e.preventDefault(); submit({ url, text, mode }); }}><div className="section-heading"><h2>Bring a job into focus.</h2><button type="button" className="text-button" onClick={cancel}>Cancel</button></div><label>Source URL<input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://company.com/careers/product-designer"/></label><label>Job post text<textarea required minLength={30} maxLength={60000} rows={11} value={text} onChange={e => setText(e.target.value)} placeholder="Paste the full listing, including the company, role requirements, and any posting-date evidence."/></label><p className="field-help">The URL is saved as evidence. The app analyzes the text you paste; it does not scrape LinkedIn or fetch the listing.</p><label>How to process this job<select value={mode} onChange={e => setMode(e.target.value)}><option value="manual">Save for manual review — no API call</option><option value="ai" disabled={!hasProvider}>Extract with my AI provider{!hasProvider ? ' — configure in Settings first' : ''}</option></select></label>{mode === 'ai' && <p className="field-help">The pasted text will be sent to your configured provider. Provider usage charges may apply.</p>}<div className="form-actions"><span>Missing details stay marked “To verify”.</span><button className="button primary" disabled={busy}>{busy ? 'Processing…' : mode === 'ai' ? 'Extract & screen job' : 'Save for review'}<Icon name="arrow" size={16}/></button></div></form>;
}
function JobDetail({ job, busy, back, save }: { job: Job; busy: boolean; back: () => void; save: (facts: Record<string, Fact>) => void }) {
  const [facts, setFacts] = useState(job.facts), [edit, setEdit] = useState(false);
  function update(key: string, part: string, value: unknown) { setFacts(old => ({ ...old, [key]: { ...old[key], [part]: value } })); }
  return <><button className="text-button back" onClick={back}>← Back to research</button><div className="detail-grid"><section className="form-panel"><div className="section-heading"><h2>{String(job.facts.title?.value || 'Unreviewed job post')}</h2><Badge>{job.assessment.status}</Badge></div><a href={job.url} target="_blank" rel="noreferrer" className="source-link">View original listing ↗</a>{job.sourceRecency && <p className="field-help">LinkedIn showed {job.sourceRecency} when reviewed. Relative time is discovery evidence, not an exact posting timestamp.</p>}<div className="decision-list">{[...job.assessment.failures, ...job.assessment.unresolved].map(reason => <p key={reason.rule}><strong>{reason.rule.replace('_', ' ')}</strong>{reason.reason}</p>)}{job.assessment.status === 'Eligible' && <p>All required job checks passed. Contact identity and history still need verification before outreach.</p>}</div><div className="section-heading"><h3>Extracted facts</h3><button className="text-button" onClick={() => setEdit(!edit)}>{edit ? 'Close editor' : 'Review facts'}</button></div>{edit ? <form onSubmit={e => { e.preventDefault(); save(facts); }}>{Object.entries(labels).map(([key, label]) => <div className="fact-editor" key={key}><label>{label}{['experienceFlexible', 'saturdayWork', 'applicationOpen'].includes(key) ? <select value={facts[key]?.value === null ? '' : String(facts[key]?.value ?? '')} onChange={e => update(key, 'value', e.target.value === '' ? null : e.target.value === 'true')}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select> : key === 'roleCategory' ? <select value={String(facts[key]?.value ?? '')} onChange={e => update(key, 'value', e.target.value || null)}><option value="">Unknown</option>{['product', 'ux', 'ui-only', 'graphic', 'engineering', 'frontend', 'lead', 'principal'].map(v => <option key={v}>{v}</option>)}</select> : <input value={String(facts[key]?.value ?? '')} type={['experienceMin', 'salaryLpa'].includes(key) ? 'number' : 'text'} min="0" step="any" onChange={e => update(key, 'value', e.target.value === '' ? null : ['experienceMin', 'salaryLpa'].includes(key) ? Number(e.target.value) : e.target.value)}/>}</label><label className="evidence-label">Exact supporting quote<input value={facts[key]?.evidence || ''} onChange={e => update(key, 'evidence', e.target.value)} placeholder="Copy the supporting text from the source"/></label></div>)}<button className="button primary" disabled={busy}>Save reviewed facts</button></form> : <dl className="facts">{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{job.facts[key]?.value === null ? <span className="muted">Not verified</span> : String(job.facts[key]?.value ?? 'Not verified')}{job.facts[key]?.evidence && <blockquote>{job.facts[key].evidence}</blockquote>}</dd></div>)}</dl>}</section><section className="source-panel"><div className="eyebrow">ORIGINAL SOURCE TEXT</div><p className="source-text">{job.text}</p><small>Imported {new Date(job.createdAt).toLocaleDateString('en-IN')} · {job.extraction === 'visible_linkedin' ? 'Visible LinkedIn research' : job.extraction === 'manual' ? 'Manual review' : 'AI extraction'}</small></section></div></>;
}
type Run = (name: string, action: () => Promise<void>, success?: string) => Promise<void>;
function ProviderForm({ state, busy, run }: { state: State; busy: boolean; run: Run }) {
  const [provider, setProvider] = useState(state.provider?.provider || 'openai'), [model, setModel] = useState(state.provider?.model || ''), [baseUrl, setBaseUrl] = useState(state.provider?.provider === 'compatible' ? state.provider.baseUrl : ''), [apiKey, setApiKey] = useState('');
  return <div className="settings-grid"><form className="form-panel" onSubmit={e => { e.preventDefault(); run('provider', async () => { await api('/settings/provider', { provider, model, baseUrl, apiKey }); setApiKey(''); }, 'Provider settings saved. Test the connection when you’re ready.'); }}><div className="section-heading"><h2>AI connection</h2><Badge tone={state.provider?.hasKey ? 'green' : ''}>{state.provider?.hasKey ? 'Key available' : 'Not connected'}</Badge></div><label>Provider<select aria-label="Provider" value={provider} onChange={e => { setProvider(e.target.value); setModel(''); setApiKey(''); }}>{Object.entries(providerNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{provider === 'compatible' && <><label>API base URL<input aria-label="API base URL" required type="url" value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setApiKey(''); }} placeholder="https://your-provider.example/v1"/><span className="field-help">Use a Chat Completions-compatible endpoint. Local model servers may use HTTP on localhost.</span></label><label>Model ID<input required value={model} onChange={e => setModel(e.target.value)} placeholder="Enter the exact model ID from your provider" autoComplete="off"/></label></>}<label>API key<input aria-label="API key" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={state.provider?.provider === provider && state.provider.hasKey ? 'Leave blank to keep the current key' : provider === 'compatible' ? 'Optional for a local server without authentication' : 'Paste your provider API key'} autoComplete="new-password"/><span className="field-help">The app chooses a suitable model automatically. The key is never returned in API responses or saved in browser storage.</span></label><div className="form-actions"><button type="button" className="button secondary" disabled={busy || !state.provider} onClick={() => run('test', async () => { await api('/provider/test', {}); }, 'Connection successful. Your provider responded.')} >Test saved connection</button><button className="button primary" disabled={busy}>{busy ? 'Working…' : 'Save provider'}</button></div><p className="field-help">Testing sends one small request to the saved provider and may use API credits.</p></form><aside className="guide-panel"><div className="eyebrow">PROVIDER FLEXIBILITY</div><h2>Bring the provider<br/>you already use.</h2><p>Choose a provider and paste its key. Outreach Desk automatically selects a suitable model.</p><h3>Keys stay behind the scenes.</h3><p>For persistent configuration, put your key in the local <code>.env</code> file. Session keys entered here take priority.</p><h3>Facts still need evidence.</h3><p>AI extracts the source. Fixed rules decide eligibility, and missing facts remain unresolved.</p><p className="field-help">Custom OpenAI-compatible services still need their endpoint and model because those details cannot be inferred from a key.</p></aside></div>;
}
function TrackerForm({ state, busy, run }: { state: State; busy: boolean; run: Run }) {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${state.spreadsheetId}/edit`;
  const [writerUrl, setWriterUrl] = useState(''), [writerToken, setWriterToken] = useState('');
  return <div className="settings-grid"><section className="form-panel"><div className="section-heading"><h2>Outreach tracker</h2><Badge tone={state.tracker ? 'green' : ''}>{state.tracker ? 'Loaded' : 'Waiting for first refresh'}</Badge></div><p>Reading your tracker is connected separately from writing. Confirmed sends stay saved locally until the writer below is set up.</p><a href={sheetUrl} target="_blank" rel="noreferrer">Open Kartik LinkedIn Outreach Master ↗</a><div className="form-actions"><button className="button primary" type="button" disabled={busy || !state.spreadsheetId} onClick={() => run('sync', async () => { await api('/tracker/sync', {}); }, 'Tracker refreshed from the public Google Sheet.')}>{busy ? 'Working…' : 'Refresh tracker'}</button></div><p className="field-help">The spreadsheet can remain “Anyone with the link · Viewer”. Public sharing allows reading, not automatic edits.</p><form onSubmit={event => { event.preventDefault(); run('writer', async () => { await api('/tracker/writer/configure', { url: writerUrl, token: writerToken }); setWriterUrl(''); setWriterToken(''); }, 'Writer settings saved on this computer. Open Completed and use Retry Sheet update for pending contacts.'); }}><h3>Automatic Master updates</h3><Badge tone={state.google.writeConfigured ? 'green' : 'amber'}>{state.google.writeConfigured ? 'Settings saved · verify with a pending update' : 'Setup needed'}</Badge><details open={!state.google.writeConfigured}><summary>One-time setup (no .env editing needed)</summary><ol><li>Open your Google Sheet, then choose <strong>Extensions → Apps Script</strong>.</li><li><a href="/api/tracker/writer/script" download>Download the writer script</a>, open it as text, paste its contents into Apps Script and save.</li><li>Create a write token below. In Apps Script, open <strong>Project Settings → Script properties</strong> and add <code>OUTREACH_WRITE_TOKEN</code> with that same token.</li><li>Choose <strong>Deploy → New deployment → Web app</strong>. Set Execute as to <strong>Me</strong> and Who has access to <strong>Anyone</strong>. Authorize Google access and deploy.</li><li>Paste the deployment URL ending in <code>/exec</code> below, then save. Keep the token private.</li><li>Go to <strong>Outreach → Completed</strong> and click <strong>Retry Sheet update</strong> for pending entries. Do not resend the invitation.</li></ol></details><label>Apps Script web app URL<input type="url" value={writerUrl} onChange={event => setWriterUrl(event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" autoComplete="off" required/></label><label>Write token<input type="password" value={writerToken} onChange={event => setWriterToken(event.target.value)} minLength={32} autoComplete="new-password" required/></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => { const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join(''); setWriterToken(token); }}>Generate write token</button><button type="button" className="button secondary" disabled={!writerToken} onClick={() => run('copy-token', async () => { await navigator.clipboard.writeText(writerToken); }, 'Token copied. Paste it into the OUTREACH_WRITE_TOKEN Script property.')}>Copy token</button><button className="button primary" disabled={busy}>Save writer on this computer</button></div><p className="field-help">Saved in the private local app database and kept after restarts. The token is not encrypted on disk; keep your app data private. Saving settings does not verify Google access until a Sheet update succeeds.</p></form></section><aside className="guide-panel"><div className="eyebrow">TRACKER HEALTH</div><h2>{state.tracker?.title || 'One source of truth.'}</h2>{state.tracker ? <><p><strong>{state.tracker.rowCount}</strong> populated Master rows loaded.</p><Badge tone={state.tracker.schemaValid ? 'green' : 'amber'}>{state.tracker.schemaValid ? 'Required schema found' : 'Schema needs review'}</Badge>{state.tracker.missingTabs.length > 0 && <p>Missing tabs: {state.tracker.missingTabs.join(' · ')}</p>}{state.tracker.missingHeaders.length > 0 && <p>Missing headers: {state.tracker.missingHeaders.join(' · ')}</p>}<h3>Available tabs</h3><p>{state.tracker.tabs.join(' · ')}</p><p className="field-help">Last read: {new Date(state.tracker.syncedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Cached data may be stale.</p></> : <p>Refresh “Kartik LinkedIn Outreach Master” to load the Master rows and unlock verified outreach.</p>}<h3>Cross-verification is active.</h3><p>Before outreach, every contact is matched against all loaded Master rows by normalized name and LinkedIn profile.</p><p>{state.google.writeConfigured ? 'The Sheet writer is configured. Mark done will update and read back the matching Master row.' : 'Automatic Sheet writes are not configured yet. Mark done keeps delivery confirmed locally and offers Retry Sheet update.'}</p></aside></div>;
}
function AutomationForm({ state, busy, run }: { state: State; busy: boolean; run: Run }) {
  const [autoSync, setAutoSync] = useState(state.automation.autoSync), [desiredSending, setDesiredSending] = useState(state.automation.desiredSending);
  function submit(e: FormEvent) { e.preventDefault(); run('automation', async () => { await api('/automation', { autoSync, desiredSending }); }, 'Automation preferences saved. Sending remains unavailable until a supported adapter is connected.'); }
  return <div className="settings-grid"><form className="form-panel" onSubmit={submit}><h2>Automation preferences</h2><label className="toggle-row"><span><strong>Refresh the tracker automatically</strong><small>Every five hours while the local service is running.</small></span><input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)}/></label><label>Preferred sending mode<select value={desiredSending} onChange={e => setDesiredSending(e.target.value)}><option value="automatic">Automatic, when a supported integration permits it</option><option value="manual">Manual review and send</option></select></label><div className="capability"><Badge tone="amber">Remote browser required</Badge><p>LinkedIn relationship checks and message entry use the visible remote browser.</p><small>The app opens the profile and copies the approved message. The remote browser verifies Connect versus Message before delivery.</small></div><div className="form-actions"><span>Preferences are saved locally.</span><button className="button primary" disabled={busy}>Save preferences</button></div></form><aside className="guide-panel"><div className="eyebrow">WHAT RUNS AUTOMATICALLY</div><h2>Useful automation.<br/>Honest status.</h2><h3>Available now</h3><p>Eligibility checks, contact matching, message drafting, Sheet duplicate checks, and five-hour tracker reads.</p><h3>Remote-browser step</h3><p>The browser rechecks the live relationship, types the right message or connection note, and waits for send confirmation.</p><h3>No accidental second send.</h3><p>Delivery state and Sheet sync state stay separate so a failed tracker update cannot trigger another message.</p></aside></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);


