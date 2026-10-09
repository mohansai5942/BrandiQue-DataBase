import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Boxes, BriefcaseBusiness,
  Check, ChevronDown, CircleAlert, Database, FileJson2, FileText, Globe2, LayoutDashboard,
  LoaderCircle, LockKeyhole, LogOut, Mail, MessageSquareText, MoreHorizontal, Pencil,
  Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, Users, WandSparkles, X
} from 'lucide-react';
import { onAuthStateChanged, reload, sendEmailVerification, signInWithEmailAndPassword, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';

type CollectionName = 'messages' | 'projects' | 'settings' | 'websites' | 'n8n_projects' | 'n8n_project_forms' | 'prompts';
type RecordValue = Record<string, unknown> & { id: string };
type Section = { id: CollectionName; title: string; subtitle: string; icon: typeof Database; noun: string };
const SECTIONS: Section[] = [
  { id: 'messages', title: 'Contact Form', subtitle: 'Contact leads and service enquiries from the original BrandiQue Admin Panel', icon: MessageSquareText, noun: 'lead' },
  { id: 'projects', title: 'Projects', subtitle: 'Main, portfolio, Figma and client projects — matching the original Admin Panel', icon: BriefcaseBusiness, noun: 'project' },
  { id: 'websites', title: 'Our Websites', subtitle: 'Website name, URL, description, logo and recycle status', icon: Globe2, noun: 'website' },
  { id: 'settings', title: 'Site Settings', subtitle: 'Public contact details, social links, working hours and admin avatar', icon: Settings2, noun: 'setting' },
  { id: 'n8n_projects', title: 'AI Automations', subtitle: 'Workflow projects, tags, node count, JSON and client-request settings', icon: WandSparkles, noun: 'automation' },
  { id: 'n8n_project_forms', title: 'Automation Enquiries', subtitle: 'Client requests submitted for individual automation projects', icon: Users, noun: 'enquiry' },
  { id: 'prompts', title: 'Prompts', subtitle: 'Prompt records in the Firestore project', icon: FileText, noun: 'prompt' },
];
const STARTER: Record<CollectionName, Record<string, unknown>> = {
  messages: { source: 'contact', name: '', email: '', phone: '', service: '', budget: '', message: '', serviceDetails: {}, isDeleted: false, createdAt: new Date().toISOString() }, 
  projects: { title: '', category: '', desc: '', tags: [], image: '', images: [], video: '', videos: [], link: '', type: 'main', isDeleted: false, createdAt: new Date().toISOString() }, 
  websites: { name: '', url: 'https://', description: '', logoUrl: '', isDeleted: false, createdAt: new Date().toISOString() }, 
  settings: { id: 'contact', email: 'brandiquewebsolutions@gmail.com', phone: '+91 70933 20572', location: 'Visakhapatnam, India', instagram: 'https://www.instagram.com/brandiquewebsolutions/', whatsapp: 'https://wa.me/917093320572', workingHours: 'Mon - Sat: 9:00 AM - 8:00 PM IST', adminAvatarUrl: '' }, 
  n8n_projects: { title: '', category: '', desc: '', tags: [], workflowJson: '{\n  "nodes": [],\n  "connections": {}\n}', nodeCount: 0, testWorkflowUrl: '', allowClientRequest: true, isDeleted: false, createdAt: new Date().toISOString() }, 
  n8n_project_forms: { projectId: '', projectTitle: '', name: '', email: '', phone: '', message: '', isDeleted: false, createdAt: new Date().toISOString() }, 
  prompts: { title: '', category: '', prompt: '', createdAt: new Date().toISOString() },
};

function pretty(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return Array.isArray(value) ? value.join(', ') : JSON.stringify(value);
  return String(value);
}
function titleFromKey(key: string) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (s) => s.toUpperCase());
}
function getSummary(record: RecordValue) {
  return String(record.title || record.name || record.projectTitle || record.email || record.url || record.id || 'Untitled record');
}
function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}
function safeFilename(value: string) { return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'records'; }

async function apiRequest<T>(user: FirebaseUser, url: string, init?: RequestInit): Promise<T> {
  const token = await user.getIdToken(true);
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('Login failed. Check the email/password and confirm the account is enabled in Firebase Authentication.');
    } finally { setBusy(false); }
  }
  return <main className="login-shell">
    <div className="login-glow glow-one" /><div className="login-glow glow-two" />
    <div className="login-card">
      <div className="brand-lockup"><div className="brand-mark"><Database size={23} /></div><div><strong>BrandiQue<span> Data</span></strong><small>SECURE OPERATIONS CONSOLE</small></div></div>
      <div className="login-emblem"><ShieldCheck size={27} /></div>
      <p className="eyebrow">PRIVATE ADMIN ACCESS</p>
      <h1>Data, under<br/><span>your control.</span></h1>
      <p className="login-copy">Manage your business records in one protected workspace. Only verified, explicitly approved admin accounts can continue.</p>
      {!firebaseConfigured && <div className="notice warn"><CircleAlert size={17}/> Firebase web configuration is missing. Add the VITE_FIREBASE_* variables in Vercel first.</div>}
      {error && <div className="notice error"><CircleAlert size={17}/>{error}</div>}
      <form onSubmit={submit} className="login-form">
        <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@brandique.in"/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Your Firebase Auth password"/></label>
        <button className="primary full" disabled={busy || !firebaseConfigured}>{busy ? <LoaderCircle className="spin" size={17}/> : <LockKeyhole size={17}/>} Sign in securely</button>
      </form>
      <div className="login-foot"><span><span className="status-dot"/> Protected session</span><span>Firebase Authentication</span></div>
    </div>
    <div className="login-side"><span className="outline-index">BQ / 01</span><div className="side-quote">“Good systems make<br/>good work repeatable.”</div><div className="side-caption">BRANDIQUE WEB SOLUTIONS <span>·</span> DATA INFRASTRUCTURE</div></div>
  </main>;
}

function RecordEditor({ section, initial, onClose, onSave, busy }: {
  section: Section; initial: RecordValue | null; onClose: () => void;
  onSave: (value: Record<string, unknown>, existingId?: string) => Promise<void>; busy: boolean;
}) {
  const seed: Record<string, unknown> = initial
    ? Object.fromEntries(Object.entries(initial).filter(([key]) => key !== 'id'))
    : { ...STARTER[section.id] };
  const [fields, setFields] = useState<Record<string, unknown>>(seed);
  const [raw, setRaw] = useState(JSON.stringify(seed, null, 2));
  const [complexDraft, setComplexDraft] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'fields' | 'json'>('fields');
  const [error, setError] = useState('');

  function updateField(key: string, value: unknown) {
    const next = { ...fields, [key]: value };
    setFields(next);
    setRaw(JSON.stringify(next, null, 2));
    setError('');
  }

  function switchMode(next: 'fields' | 'json') {
    if (next === 'json') {
      setRaw(JSON.stringify(fields, null, 2));
      setMode('json');
      setError('');
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Record must be a JSON object.');
      setFields(parsed);
      setComplexDraft({});
      setMode('fields');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix invalid JSON before switching to form view.');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      let parsed: Record<string, unknown>;
      if (mode === 'json') {
        parsed = JSON.parse(raw);
      } else {
        parsed = { ...fields };
        for (const [key, text] of Object.entries(complexDraft)) {
          const current = fields[key];
          if (Array.isArray(current) && current.every(item => typeof item === 'string')) continue;
          if (typeof current === 'object' && current !== null) parsed[key] = JSON.parse(text);
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Record must be a JSON object.');
      if (typeof parsed.workflowJson === 'string' && parsed.workflowJson.trim()) {
        try { JSON.parse(parsed.workflowJson); } catch { throw new Error('Workflow JSON must contain valid JSON syntax.'); }
      }
      void onSave(parsed, initial?.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please correct the record before saving.'); }
  }

  const entries = Object.entries(fields).filter(([key]) => key !== 'id');
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form className="editor-modal" onSubmit={submit}>
      <div className="modal-head"><div><div className="eyebrow">{initial ? 'EDIT EXISTING RECORD' : 'CREATE RECORD'}</div><h2>{initial ? 'Update record' : `New ${section.noun}`}</h2><p>Validated changes · Saved to the configured Firestore project</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close editor"><X size={19}/></button></div>
      <div className="editor-warning"><ShieldCheck size={17}/><span>Changes are written to the configured Firestore project. The public site reflects them only after its integration is pointed to this same project/API.</span></div>
      <div className="editor-tabs"><button type="button" onClick={() => switchMode('fields')} className={mode === 'fields' ? 'editor-tab active' : 'editor-tab'}><Settings2 size={14}/> Form fields</button><button type="button" onClick={() => switchMode('json')} className={mode === 'json' ? 'editor-tab active' : 'editor-tab'}><FileJson2 size={14}/> Advanced JSON</button><span>{mode === 'fields' ? `${entries.length} fields` : 'Raw record payload'}</span></div>
      {mode === 'json' ? <textarea className={`json-editor ${section.id === 'projects' || section.id === 'n8n_projects' ? 'with-live-preview' : ''}`} spellCheck={false} value={raw} onChange={e => setRaw(e.target.value)} aria-label="Record JSON"/> :
        <div className={`field-editor-grid ${section.id === 'projects' || section.id === 'n8n_projects' ? 'with-live-preview' : ''}`}>
          {entries.map(([key, value]) => {
            const label = titleFromKey(key);
            const stringValue = value === null || value === undefined ? '' : String(value);
            const isLongText = /message|description|^desc$|prompt|workflowjson/i.test(key);
            if (typeof value === 'boolean') return <label className="editor-field toggle-field" key={key}><span><strong>{label}</strong><small>Boolean value</small></span><input type="checkbox" checked={value} onChange={e => updateField(key, e.target.checked)}/></label>;
            if (Array.isArray(value)) {
              const simpleStrings = value.every(item => typeof item === 'string');
              const currentText = complexDraft[key] ?? (simpleStrings ? (key.toLowerCase().includes('tag') ? value.join(', ') : value.join('\n')) : JSON.stringify(value, null, 2));
              return <label className="editor-field wide-field" key={key}><span>{label}</span><textarea value={currentText} spellCheck={false} onChange={e => {
                const text = e.target.value;
                setComplexDraft(old => ({ ...old, [key]: text }));
                if (simpleStrings) updateField(key, key.toLowerCase().includes('tag') ? text.split(',').map(item => item.trim()).filter(Boolean) : text.split(/\r?\n/).map(item => item.trim()).filter(Boolean));
              }} placeholder={simpleStrings ? (key.toLowerCase().includes('tag') ? 'Separate items with commas' : 'One item per line') : 'Valid JSON array'} rows={Math.min(6, Math.max(2, currentText.split('\n').length))}/><small>{simpleStrings ? (key.toLowerCase().includes('tag') ? 'Separate tags with commas.' : 'Use one URL or item per line.') : 'Array/object field: enter valid JSON.'}</small></label>;
            }
            if (typeof value === 'object' && value !== null) {
              const currentText = complexDraft[key] ?? JSON.stringify(value, null, 2);
              return <label className="editor-field wide-field" key={key}><span>{label}</span><textarea value={currentText} spellCheck={false} onChange={e => setComplexDraft(old => ({ ...old, [key]: e.target.value }))} rows={Math.min(8, Math.max(3, currentText.split('\n').length))}/><small>Enter a valid JSON object.</small></label>;
            }
            if (isLongText || stringValue.length > 100) return <label className="editor-field wide-field" key={key}><span>{label}</span><textarea value={stringValue} onChange={e => updateField(key, e.target.value)} rows={key.toLowerCase().includes('workflowjson') ? 8 : 3} spellCheck={false}/></label>;
            const lowerKey = key.toLowerCase();
            const inputType = lowerKey.includes('email') ? 'email' : (lowerKey.includes('url') || lowerKey.endsWith('link') || lowerKey.includes('image') || lowerKey.includes('video') || lowerKey.includes('instagram') || lowerKey.includes('whatsapp')) ? 'text' : (typeof value === 'number' ? 'number' : 'text');
            const options = key === 'type' && section.id === 'projects'
              ? [{ value: 'main', label: 'Main Project' }, { value: 'portfolio', label: 'Portfolio Project' }, { value: 'figma', label: 'Figma Project' }, { value: 'client', label: 'Client Project' }]
              : key === 'source' && section.id === 'messages'
                ? [{ value: 'contact', label: 'Contact Form' }, { value: 'service', label: 'Service Enquiry' }]
                : null;
            if (options) return <label className="editor-field" key={key}><span>{label}</span><select value={stringValue} onChange={e => updateField(key, e.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
            return <label className="editor-field" key={key}><span>{label}</span><input type={inputType} value={stringValue} onChange={e => updateField(key, typeof value === 'number' ? Number(e.target.value) : e.target.value)} spellCheck={false}/></label>;
          })}
          <div className="form-tip"><FileJson2 size={15}/><span>Need a custom field? Use <strong>Advanced JSON</strong> to add or edit any field in this record.</span></div>
        </div>}
      {(section.id === 'projects' || section.id === 'n8n_projects') && <aside className={`live-preview-panel ${section.id === 'n8n_projects' ? 'workflow-preview' : 'project-preview'}`} aria-live="polite">
        <div className="live-preview-heading"><span><Activity size={15}/> LIVE SIDE PREVIEW</span><span className="live-pill">LIVE</span></div>
        {section.id === 'projects' ? <>
          <div className="project-preview-media">{Array.isArray(fields.images) && fields.images.length > 0 ? <img src={String(fields.images[0])} alt="Project preview" onError={e => { e.currentTarget.style.display = 'none'; }}/> : fields.image ? <img src={String(fields.image)} alt="Project preview" onError={e => { e.currentTarget.style.display = 'none'; }}/> : <div className="preview-placeholder"><Globe2 size={28}/><span>Project image preview</span></div>}</div>
          <div className="preview-project-copy"><span className="preview-category">{String(fields.category || 'CATEGORY NAME')}</span><span className="preview-type">{String(fields.type || 'main').toUpperCase()}</span><h3>{String(fields.title || 'Project title placeholder')}</h3><p>{String(fields.desc || 'Project description will appear here as you type…')}</p><div className="preview-tags">{(Array.isArray(fields.tags) ? fields.tags : String(fields.tags || '').split(',')).filter(Boolean).slice(0,6).map((tag,i)=><span key={i}>{String(tag).trim()}</span>)}</div>{fields.link && <div className="preview-link"><Globe2 size={13}/>{String(fields.link)}</div>}</div>
          <div className="preview-note">This is a content preview. Save to write changes to Firestore.</div>
        </> : <>
          <div className="workflow-preview-canvas">{(() => { let parsed: any = {}; try { parsed = JSON.parse(String(fields.workflowJson || '{}')); } catch { return <div className="preview-invalid"><CircleAlert size={18}/> Workflow JSON has a syntax error.</div>; } const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : []; return nodes.length ? <><div className="workflow-node-count">{nodes.length} NODES</div><div className="workflow-node-list">{nodes.slice(0,12).map((node: any,i: number)=><div className="workflow-node" key={String(node.id || i)}><span className="workflow-node-icon"><Boxes size={14}/></span><span><strong>{String(node.name || node.type || `Node ${i+1}`)}</strong><small>{String(node.type || 'Workflow node').replace(/^n8n-nodes-base\./,'')}</small></span></div>)}</div>{nodes.length>12 && <div className="preview-note">Showing 12 of {nodes.length} nodes</div>}</> : <div className="preview-placeholder"><Boxes size={28}/><span>Add nodes in Workflow JSON</span></div>; })()}</div>
          <div className="preview-project-copy"><span className="preview-category">{String(fields.category || 'AI & AUTOMATION')}</span><h3>{String(fields.title || 'Workflow title placeholder')}</h3><p>{String(fields.desc || 'Workflow summary will appear here as you type…')}</p><div className="preview-tags">{(Array.isArray(fields.tags) ? fields.tags : String(fields.tags || '').split(',')).filter(Boolean).slice(0,6).map((tag,i)=><span key={i}>{String(tag).trim()}</span>)}</div><div className="workflow-preview-meta"><span>{String(fields.testWorkflowUrl || 'No test URL added')}</span><span>{fields.allowClientRequest ? 'Client form enabled' : 'Client form disabled'}</span></div></div>
          <div className="preview-note">Live JSON preview · save to update the database record.</div>
        </>}
      </aside>}
      {error && <div className="notice error">{error}</div>}
      <div className="modal-foot"><span className="subtle">{initial ? `Document ID: ${initial.id}` : `Collection: ${section.id}`}</span><div className="actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} Save record</button></div></div>
    </form>
  </div>;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [active, setActive] = useState<CollectionName>('messages');
  const [records, setRecords] = useState<RecordValue[]>([]);
  const [counts, setCounts] = useState<Partial<Record<CollectionName, number>>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [messageView, setMessageView] = useState<'all' | 'contact' | 'service'>('all');
  const [editor, setEditor] = useState<RecordValue | null | 'new'>(null);
  const [toast, setToast] = useState('');
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const current = SECTIONS.find(s => s.id === active)!;

  useEffect(() => {
    if (!firebaseConfigured || !auth) { setAuthLoading(false); return; }
    return onAuthStateChanged(auth, next => { setUser(next); setAuthLoading(false); });
  }, []);
  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3600); }, []);

  const loadRecords = useCallback(async (collectionName: CollectionName, who = user) => {
    if (!who) return;
    setLoading(true);
    try {
      const payload = await apiRequest<{ records: RecordValue[]; returned: number }>(who, `/api/data?collection=${encodeURIComponent(collectionName)}`);
      setRecords(payload.records || []);
      setCounts(old => ({ ...old, [collectionName]: payload.returned ?? payload.records?.length ?? 0 }));
      setApiStatus('ok');
    } catch (e) {
      setRecords([]); setApiStatus('error'); notify(e instanceof Error ? e.message : 'Could not load records.');
    } finally { setLoading(false); }
  }, [user, notify]);

  useEffect(() => { if (user) void loadRecords(active, user); }, [user, active, loadRecords]);
  useEffect(() => {
    if (!user) return;
    apiRequest<{ ok: boolean; projectConfigured: boolean; adminAllowlistConfigured: boolean }>(user, '/api/health').then((status) => setApiStatus(status.projectConfigured && status.adminAllowlistConfigured ? 'ok' : 'error')).catch(() => setApiStatus('error'));
  }, [user]);

  const visible = useMemo(() => records.filter(record => {
    if (!showDeleted && record.isDeleted === true) return false;
    if (showDeleted && record.isDeleted !== true) return false;
    const serviceKeywords = ['full-stack', 'full stack', 'react', 'next.js', 'web development', 'wordpress', 'wp', 'branding', 'identity', 'logo', 'digital marketing', 'marketing', 'social', 'ai automation', 'ai', 'agent', 'automation', 'n8n', 'bot'];
    const isServiceEnquiry = record.source === 'service' || (record.serviceDetails && Object.keys(record.serviceDetails as Record<string, unknown>).length > 0) || serviceKeywords.some(keyword => String(record.service || '').toLowerCase().includes(keyword));
    if (active === 'messages' && messageView === 'contact' && isServiceEnquiry) return false;
    if (active === 'messages' && messageView === 'service' && !isServiceEnquiry) return false;
    const q = search.toLowerCase().trim();
    return !q || JSON.stringify(record).toLowerCase().includes(q);
  }), [records, search, showDeleted, active, messageView]);

  const dashboardCounts = useMemo(() => ({
    total: Object.values(counts).reduce((total, value) => total + (value || 0), 0),
    leads: counts.messages || 0, projects: counts.projects || 0, automations: counts.n8n_projects || 0
  }), [counts]);

  async function saveRecord(value: Record<string, unknown>, id?: string) {
    if (!user) return;
    setBusy(true);
    try {
      if (id) await apiRequest(user, `/api/data?collection=${encodeURIComponent(active)}&id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(value) });
      else await apiRequest(user, `/api/data?collection=${encodeURIComponent(active)}`, { method: 'POST', body: JSON.stringify(value) });
      setEditor(null); notify(id ? 'Record updated successfully.' : 'Record created successfully.'); await loadRecords(active, user);
    } catch (e) { notify(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setBusy(false); }
  }

  async function softDelete(record: RecordValue) {
    if (!user || !window.confirm(`Move “${getSummary(record)}” to the recycle bin? This is a reversible soft delete.`)) return;
    setBusy(true);
    try {
      await apiRequest(user, `/api/data?collection=${encodeURIComponent(active)}&id=${encodeURIComponent(record.id)}`, { method: 'DELETE' });
      notify('Record moved to recycle bin.'); await loadRecords(active, user);
    } catch (e) { notify(e instanceof Error ? e.message : 'Delete failed.'); }
    finally { setBusy(false); }
  }

  async function restore(record: RecordValue) {
    if (!user) return;
    setBusy(true);
    try {
      const { id: _recordId, ...recordFields } = record;
      const value = { ...recordFields, isDeleted: false, deletedAt: null };
      await apiRequest(user, `/api/data?collection=${encodeURIComponent(active)}&id=${encodeURIComponent(record.id)}`, { method: 'PATCH', body: JSON.stringify(value) });
      notify('Record restored.'); await loadRecords(active, user);
    } catch (e) { notify(e instanceof Error ? e.message : 'Restore failed.'); }
    finally { setBusy(false); }
  }

  function exportRecords(format: 'json' | 'csv') {
    const exported: Record<string, unknown>[] = visible.map(({ id, ...rest }) => ({ id, ...rest }));
    if (format === 'json') downloadFile(`brandique-${safeFilename(active)}.json`, JSON.stringify(exported, null, 2), 'application/json');
    else {
      const keys = Array.from(new Set(exported.flatMap(row => Object.keys(row))));
      const cell = (v: unknown) => `"${pretty(v).replace(/"/g, '""')}"`;
      const csv = [keys.map(cell).join(','), ...exported.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n');
      downloadFile(`brandique-${safeFilename(active)}.csv`, csv, 'text/csv;charset=utf-8');
    }
    notify(`Exported ${exported.length} records.`);
  }

  async function sendVerificationAgain() {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      notify('Verification email sent. Open the newest email and click its verification link, then sign out and sign in again.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not send verification email.');
    }
  }

  async function refreshVerificationStatus() {
    if (!user) return;
    try {
      await reload(user);
      const refreshed = auth.currentUser;
      if (refreshed) setUser(refreshed);
      if (refreshed?.emailVerified) {
        notify('Email verified. Refreshing your secure data session…');
        await refreshed.getIdToken(true);
        await loadRecords(active, refreshed);
      } else {
        notify('Firebase still reports this email as unverified. Open the newest verification email link first.');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not refresh verification status.');
    }
  }

  async function signOutUser() { await signOut(auth); setRecords([]); setCounts({}); }

  if (authLoading) return <div className="boot-screen"><div className="brand-mark"><Database size={22}/></div><LoaderCircle className="spin" size={24}/><span>Securing your workspace…</span></div>;
  if (!user) return <LoginScreen/>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark"><Database size={21}/></div><div><strong>BrandiQue<span> Data</span></strong><small>OPERATIONS CONSOLE</small></div></div>
      <div className="workspace-label">WORKSPACE <span>01</span></div>
      <button className={active === 'messages' ? 'nav-item active' : 'nav-item'} onClick={() => setActive('messages')}><MessageSquareText size={17}/><span>Overview & leads</span>{active === 'messages' && <span className="nav-active-dot"/>}</button>
      <div className="nav-section-label">DATA COLLECTIONS</div>
      {SECTIONS.filter(section => section.id !== 'messages').map(section => {
        const Icon = section.icon;
        return <button key={section.id} className={active === section.id ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(section.id); setShowDeleted(false); }}><Icon size={17}/><span>{section.title}</span>{counts[section.id] !== undefined && <span className="nav-count">{counts[section.id]}</span>}</button>;
      })}
      <div className="sidebar-spacer"/>
      <div className="security-card"><div className="security-icon"><ShieldCheck size={17}/></div><div><strong>Protected workspace</strong><span>Firebase Auth + server checks</span></div><BadgeCheck size={17} className="verified"/></div>
      <button className="nav-item logout" onClick={signOutUser}><LogOut size={17}/><span>Sign out</span></button>
      <div className="sidebar-bottom"><span className="status-dot"/><span>BrandiQue Web Solutions</span><span className="version">V1.0</span></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ArrowRight size={14}/><strong>{current.title}</strong></div><div className="top-actions"><span className={apiStatus === 'ok' ? 'system-status' : 'system-status off'}><span className="status-dot"/>{apiStatus === 'ok' ? 'API connected' : apiStatus === 'checking' ? 'Checking API' : 'API needs setup'}</span><div className="user-pill"><div className="avatar">{(user.email || 'A').slice(0,1).toUpperCase()}</div><div><strong>{user.email}</strong><small>Administrator</small></div></div><button className="icon-btn" onClick={signOutUser} title="Sign out"><LogOut size={17}/></button></div></header>

      <section className="page-content">
        {user && !user.emailVerified && <div className="notice warn" style={{ marginBottom: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CircleAlert size={20} />
          <div style={{ flex: 1 }}><strong>Email verification is still pending</strong><div>Firebase has not marked this signed-in account as verified. Send a fresh verification email, open its newest link, then check the status here.</div></div>
          <button className="secondary" onClick={() => void sendVerificationAgain()}><Mail size={15}/> Send email</button>
          <button className="secondary" onClick={() => void refreshVerificationStatus()}><RefreshCw size={15}/> Check again</button>
        </div>}
        <div className="welcome-row"><div><div className="eyebrow"><span className="gold-line"/> BUSINESS DATA MANAGEMENT</div><h1>{active === 'messages' ? <>Good systems. <em>Clear insights.</em></> : current.title}</h1><p>{active === 'messages' ? 'A secure, single place to view and manage the records powering your business.' : current.subtitle}</p></div><div className="welcome-ornament"><div className="ornament-ring"/><Database size={27}/><span> BQ / DATA</span></div></div>
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-top"><span>Total loaded records</span><Boxes size={17}/></div><strong>{dashboardCounts.total}</strong><small>Across collections visited this session</small></div>
          <div className="stat-card"><div className="stat-top"><span>Enquiries</span><MessageSquareText size={17}/></div><strong>{dashboardCounts.leads}</strong><small>Loaded contact records</small></div>
          <div className="stat-card"><div className="stat-top"><span>Portfolio projects</span><BriefcaseBusiness size={17}/></div><strong>{dashboardCounts.projects}</strong><small>Loaded project records</small></div>
          <div className="stat-card"><div className="stat-top"><span>Automation projects</span><Activity size={17}/></div><strong>{dashboardCounts.automations}</strong><small>Loaded workflow records</small></div>
        </div>

        <section className="data-panel">
          <div className="panel-heading"><div><div className="eyebrow">COLLECTION / {String(SECTIONS.findIndex(s => s.id === active) + 1).padStart(2,'0')}</div><h2>{current.title}</h2><p>{current.subtitle} <span className="separator">·</span> Showing up to 100 records</p></div><div className="panel-heading-actions"><button className="secondary" onClick={() => void loadRecords(active)} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> Refresh</button><button className="primary" onClick={() => setEditor('new')}><Plus size={16}/> Add record</button></div></div>
          <div className="toolbar"><div className="searchbox"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${current.title.toLowerCase()}…`}/>{search && <button className="clear-search" onClick={() => setSearch('')}><X size={14}/></button>}</div><div className="toolbar-right">{active === 'messages' && <div className="message-view-switch"><button className={messageView === 'all' ? 'filter-chip selected' : 'filter-chip'} onClick={() => setMessageView('all')}>All</button><button className={messageView === 'contact' ? 'filter-chip selected' : 'filter-chip'} onClick={() => setMessageView('contact')}>Contact Form</button><button className={messageView === 'service' ? 'filter-chip selected' : 'filter-chip'} onClick={() => setMessageView('service')}>Service Enquiries</button></div>}<button className={showDeleted ? 'filter-chip selected' : 'filter-chip'} onClick={() => setShowDeleted(!showDeleted)}><Trash2 size={14}/>{showDeleted ? 'Recycle bin' : 'Active records'}</button><button className="export-button" onClick={() => exportRecords('json')}><FileJson2 size={15}/> JSON</button><button className="export-button" onClick={() => exportRecords('csv')}><ArrowDownToLine size={15}/> CSV</button></div></div>

          {loading ? <div className="empty-state"><LoaderCircle className="spin" size={28}/><strong>Loading records</strong><span>Securely requesting Firestore data…</span></div> :
          apiStatus === 'error' && !records.length ? <div className="empty-state"><CircleAlert size={28}/><strong>API setup required</strong><span>Check the Vercel server logs and required environment variables.</span><button className="secondary" onClick={() => void loadRecords(active)}><RefreshCw size={15}/> Try again</button></div> :
          visible.length === 0 ? <div className="empty-state"><Database size={29}/><strong>{showDeleted ? 'Recycle bin is empty' : 'No records found'}</strong><span>{search ? 'Try a different search phrase.' : 'Add a record or wait for the public website to receive new submissions.'}</span>{!showDeleted && <button className="primary" onClick={() => setEditor('new')}><Plus size={16}/> Create first record</button>}</div> :
          <div className="record-table-wrap"><table className="record-table"><thead><tr><th>RECORD</th><th>PREVIEW</th><th>UPDATED / CREATED</th><th>STATUS</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{visible.map(record => {
            const summary = getSummary(record);
            const detail = String(record.email || record.category || record.service || record.url || record.desc || record.message || record.phone || '');
            const timestamp = pretty(record.updatedAt || record.createdAt || record.deletedAt);
            return <tr key={record.id}><td><div className="record-name"><div className="record-avatar">{summary.trim().slice(0,1).toUpperCase() || 'R'}</div><div><strong>{summary}</strong><small>{record.id}</small></div></div></td><td><span className="record-preview">{detail.length > 70 ? detail.slice(0,70) + '…' : detail}</span></td><td><span className="timestamp">{timestamp}</span></td><td><span className={record.isDeleted ? 'state-pill deleted' : 'state-pill'}><span/>{record.isDeleted ? 'In recycle bin' : 'Active'}</span></td><td><div className="row-actions">{record.isDeleted ? <button className="table-action restore" onClick={() => void restore(record)} disabled={busy}><RefreshCw size={15}/> Restore</button> : <button className="table-action" onClick={() => setEditor(record)}><Pencil size={15}/> Edit</button>}{!record.isDeleted && <button className="table-action danger" onClick={() => void softDelete(record)} disabled={busy} title="Move to recycle bin"><Trash2 size={15}/></button>}</div></td></tr>;
          })}</tbody></table><div className="table-foot"><span>Showing <strong>{visible.length}</strong> record{visible.length === 1 ? '' : 's'}</span><span><ShieldCheck size={14}/> Authenticated request · soft delete enabled</span></div></div>}
        </section>
        <footer className="page-footer"><span>© {new Date().getFullYear()} BrandiQue Web Solutions</span><span><LockKeyhole size={13}/> Private admin environment</span><span>Data is stored in your configured Firebase project</span></footer>
      </section>
    </main>
    {editor && <RecordEditor key={typeof editor === 'string' ? `new-${active}` : editor.id} section={current} initial={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSave={saveRecord} busy={busy}/>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}
