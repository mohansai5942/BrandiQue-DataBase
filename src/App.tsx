import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Boxes, BriefcaseBusiness,
  Check, ChevronDown, CircleAlert, Database, FileJson2, FileText, Globe2, LayoutDashboard,
  ExternalLink, Eye, Film, ImagePlus, LoaderCircle, LockKeyhole, LogOut, Mail, MessageSquareText, MoreHorizontal, Pencil,
  Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, Upload, Users, WandSparkles, X
} from 'lucide-react';
import { onAuthStateChanged, reload, sendEmailVerification, signInWithEmailAndPassword, signOut, User as FirebaseUser } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, firebaseConfigured, storage } from './firebase';
import { getMessageClassification, isRecordPayload } from '../api/security';
import { WorkflowCanvas } from './WorkflowCanvas';

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
      if (!auth) throw new Error('Firebase Authentication is not configured.');
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
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [videoUrlDraft, setVideoUrlDraft] = useState('');
  const [mediaTab, setMediaTab] = useState<'images' | 'videos' | 'link'>('images');
  const [uploading, setUploading] = useState(false);

  const projectImages = Array.isArray(fields.images) ? fields.images.map(String) : (fields.image ? [String(fields.image)] : []);
  const projectVideos = Array.isArray(fields.videos) ? fields.videos.map(String) : (fields.video ? [String(fields.video)] : []);

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
        try {
          const workflow = JSON.parse(parsed.workflowJson);
          if (!workflow || typeof workflow !== 'object' || !Array.isArray(workflow.nodes)) throw new Error('Workflow must contain a nodes array.');
          parsed.nodeCount = workflow.nodes.length;
        } catch (workflowError) { throw new Error(workflowError instanceof Error && workflowError.message === 'Workflow must contain a nodes array.' ? workflowError.message : 'Workflow JSON must contain valid JSON syntax.'); }
      }
      if (section.id === 'projects') {
        parsed.images = projectImages.slice(0, 10);
        parsed.videos = projectVideos.slice(0, 5);
        parsed.image = projectImages[0] || '';
        parsed.video = projectVideos[0] || '';
      }
      void onSave(parsed, initial?.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please correct the record before saving.'); }
  }

  function addMediaUrl(kind: 'images' | 'videos') {
    const draft = kind === 'images' ? imageUrlDraft.trim() : videoUrlDraft.trim();
    if (!draft) return;
    try {
      const parsed = new URL(draft);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Use an http or https URL.');
    } catch {
      setError('Enter a complete http(s) media URL.');
      return;
    }
    const existing = kind === 'images' ? projectImages : projectVideos;
    const max = kind === 'images' ? 10 : 5;
    if (existing.length >= max) { setError(`A project can have up to ${max} ${kind}.`); return; }
    if (existing.includes(draft)) { setError('That URL is already in this project.'); return; }
    updateField(kind, [...existing, draft]);
    if (kind === 'images') setImageUrlDraft(''); else setVideoUrlDraft('');
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>, kind: 'images' | 'videos') {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (!storage) { setError('Firebase Storage is not configured for this dashboard.'); return; }
    const current = kind === 'images' ? projectImages : projectVideos;
    const limit = kind === 'images' ? 10 : 5;
    const validType = kind === 'images' ? (file: File) => file.type.startsWith('image/') : (file: File) => file.type.startsWith('video/');
    if (current.length + files.length > limit) { setError(`A project can have up to ${limit} ${kind}.`); return; }
    if (files.some(file => !validType(file) || file.size > 25 * 1024 * 1024)) {
      setError(kind === 'images' ? 'Choose image files no larger than 25 MB each.' : 'Choose video files no larger than 25 MB each.');
      return;
    }
    setUploading(true); setError('');
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const destination = ref(storage, `dashboard/projects/${crypto.randomUUID()}-${filename}`);
        const result = await uploadBytes(destination, file, { contentType: file.type });
        uploaded.push(await getDownloadURL(result.ref));
      }
      updateField(kind, [...current, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? `Upload failed: ${uploadError.message}. Confirm the Firebase Storage bucket and admin-only Storage rules are configured.` : 'Upload failed. Confirm Firebase Storage is configured.');
    } finally { setUploading(false); }
  }

  const entries = Object.entries(fields).filter(([key]) => key !== 'id');
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form className="editor-modal" onSubmit={submit}>
      <div className="modal-head"><div><div className="eyebrow">{initial ? 'EDIT EXISTING RECORD' : 'CREATE RECORD'}</div><h2>{initial ? 'Update record' : section.id === 'projects' ? 'New project' : section.id === 'n8n_projects' ? 'New workflow' : `New ${section.noun}`}</h2><p>Validated changes · Saved to the configured Firestore project</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close editor"><X size={19}/></button></div>
      <div className="editor-warning"><ShieldCheck size={17}/><span>Changes are written to the configured Firestore project. The public site reflects them only after its integration is pointed to this same project/API.</span></div>
      <div className="editor-tabs"><button type="button" onClick={() => switchMode('fields')} className={mode === 'fields' ? 'editor-tab active' : 'editor-tab'}><Settings2 size={14}/> Form fields</button><button type="button" onClick={() => switchMode('json')} className={mode === 'json' ? 'editor-tab active' : 'editor-tab'}><FileJson2 size={14}/> Advanced JSON</button><span>{mode === 'fields' ? `${entries.length} fields` : 'Raw record payload'}</span></div>
      {mode === 'json' ? <textarea className={'json-editor ' + ((section.id === 'projects' || section.id === 'n8n_projects') ? 'with-live-preview' : '')} spellCheck={false} value={raw} onChange={e => setRaw(e.target.value)} aria-label="Record JSON"/> :
        <div className={'field-editor-grid ' + ((section.id === 'projects' || section.id === 'n8n_projects') ? 'with-live-preview' : '')}>
          {section.id === 'projects' && <div className="media-editor wide-field">
            <div className="media-editor-heading"><div><strong>Project images</strong><small>{projectImages.length}/10 images</small></div><label className="upload-control"><Upload size={15}/> Upload images<input type="file" accept="image/*" multiple onChange={event => void uploadMedia(event, 'images')} disabled={uploading}/></label></div>
            <div className="media-url-row"><input aria-label="Project image URL" type="url" placeholder="Paste an image URL" value={imageUrlDraft} onChange={event => setImageUrlDraft(event.target.value)}/><button type="button" className="secondary" onClick={() => addMediaUrl('images')}><Plus size={14}/> Add URL</button></div>
            {projectImages.length > 0 && <div className="media-items">{projectImages.map((url, index) => <div className="media-item" key={`${url}-${index}`}><img src={url} alt={`Project image ${index + 1}`} onError={event => { event.currentTarget.style.opacity = '.35'; }}/><span>Image {index + 1}</span><button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => updateField('images', projectImages.filter((_, itemIndex) => itemIndex !== index))}><X size={14}/></button></div>)}</div>}
            <div className="media-editor-heading video-heading"><div><strong>Project videos</strong><small>{projectVideos.length}/5 videos</small></div><label className="upload-control"><Upload size={15}/> Upload videos<input type="file" accept="video/*" multiple onChange={event => void uploadMedia(event, 'videos')} disabled={uploading}/></label></div>
            <div className="media-url-row"><input aria-label="Project video URL" type="url" placeholder="Paste a video URL" value={videoUrlDraft} onChange={event => setVideoUrlDraft(event.target.value)}/><button type="button" className="secondary" onClick={() => addMediaUrl('videos')}><Plus size={14}/> Add URL</button></div>
            {projectVideos.length > 0 && <div className="media-items video-items">{projectVideos.map((url, index) => <div className="media-item" key={`${url}-${index}`}><Film size={17}/><span>Video {index + 1}: {url}</span><button type="button" aria-label={`Remove video ${index + 1}`} onClick={() => updateField('videos', projectVideos.filter((_, itemIndex) => itemIndex !== index))}><X size={14}/></button></div>)}</div>}
            {uploading && <small className="upload-progress"><LoaderCircle className="spin" size={14}/> Uploading media to Firebase Storage…</small>}
            {!storage && <small className="upload-progress">Storage upload needs an active bucket and admin-only Storage rules in Firebase Console.</small>}
          </div>}
          {entries.filter(([key]) => !(section.id === 'projects' && ['image', 'images', 'video', 'videos'].includes(key))).map(([key, value]) => {
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
            if (key === 'workflowJson' && section.id === 'n8n_projects') return <label className="editor-field wide-field" key={key}><span>{label}</span><div className="json-toolbar"><button type="button" className="secondary" onClick={() => { try { updateField(key, JSON.stringify(JSON.parse(stringValue), null, 2)); } catch { setError('Workflow JSON must be valid before formatting.'); } }}><Sparkles size={14}/> Format JSON</button><small>JSON syntax is validated before save; node count updates automatically.</small></div><textarea value={stringValue} onChange={e => updateField(key, e.target.value)} rows={12} spellCheck={false}/></label>;
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
      {(section.id === 'projects' || section.id === 'n8n_projects') && <aside className={'live-preview-panel ' + (section.id === 'n8n_projects' ? 'workflow-preview' : 'project-preview')} aria-live="polite">
        <div className="live-preview-heading"><span><Activity size={15}/> SIDE PREVIEW PANEL</span><span className="live-pill">Live Updates</span></div>
        {section.id === 'projects' ? <>
          <div className="preview-tabs"><button type="button" className={mediaTab === 'images' ? 'active' : ''} onClick={() => setMediaTab('images')}><ImagePlus size={13}/> Images ({projectImages.length})</button><button type="button" className={mediaTab === 'videos' ? 'active' : ''} onClick={() => setMediaTab('videos')}><Film size={13}/> Videos ({projectVideos.length})</button><button type="button" className={mediaTab === 'link' ? 'active' : ''} onClick={() => setMediaTab('link')}><Globe2 size={13}/> Link</button></div>
          <div className="project-preview-media">{mediaTab === 'images' ? projectImages[0] ? <img src={projectImages[0]} alt="Project live preview"/> : <div className="preview-placeholder"><ImagePlus size={28}/><strong>No project image yet</strong><small>Add a URL or upload an image</small></div> : mediaTab === 'videos' ? projectVideos[0] ? <video src={projectVideos[0]} controls preload="metadata" aria-label="Project video preview"/> : <div className="preview-placeholder"><Film size={28}/><strong>No project video yet</strong><small>Add a URL or upload a video</small></div> : fields.link ? <a className="preview-link-card" href={String(fields.link)} target="_blank" rel="noreferrer"><ExternalLink size={20}/><strong>Open project link</strong><span>{String(fields.link)}</span></a> : <div className="preview-placeholder"><Globe2 size={28}/><strong>No external link</strong><small>Add an action URL to preview it here</small></div>}</div>
          <div className="preview-section-label">WEBSITE SHOWCASE CARD MOCKUP</div>
          <div className="preview-project-copy"><span className="preview-category">{String(fields.category || 'CATEGORY NAME')}</span><span className="preview-type">{String(fields.type || 'main').toUpperCase()}</span><h3>{String(fields.title || 'Project title placeholder')}</h3><p>{String(fields.desc || 'Project description will appear here as you type…')}</p><div className="preview-tags">{(Array.isArray(fields.tags) ? fields.tags : String(fields.tags || '').split(',')).filter(Boolean).slice(0,6).map((tag,i)=><span key={i}>{String(tag).trim()}</span>)}</div>{Boolean(fields.link) && <div className="preview-link"><Globe2 size={13}/>{String(fields.link)}</div>}</div>
        </> : <>
          <WorkflowCanvas value={fields.workflowJson} />
          <div className="preview-project-copy"><span className="preview-category">{String(fields.category || 'AI & AUTOMATION')}</span><h3>{String(fields.title || 'Workflow title placeholder')}</h3><p>{String(fields.desc || 'Workflow summary will appear here as you type…')}</p><div className="preview-tags">{(Array.isArray(fields.tags) ? fields.tags : String(fields.tags || '').split(',')).filter(Boolean).slice(0,6).map((tag,i)=><span key={i}>{String(tag).trim()}</span>)}</div><div className="workflow-preview-meta"><span>{String(fields.testWorkflowUrl || 'No test URL added')}</span><span>{fields.allowClientRequest ? 'Client form enabled' : 'Client form disabled'}</span></div></div>
        </>}
        <div className="preview-note">Live content preview · save to write changes to Firestore</div>
      </aside>}
      {error && <div className="notice error">{error}</div>}
      <div className="modal-foot"><span className="subtle">{initial ? `Document ID: ${initial.id}` : `Collection: ${section.id}`}</span><div className="actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy || uploading}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>} {section.id === 'projects' ? initial ? 'Save Project' : 'Publish Project' : section.id === 'n8n_projects' ? initial ? 'Save Workflow' : 'Publish Workflow' : 'Save record'}</button></div></div>
    </form>
  </div>;
}

function ProjectDetailDialog({ record, onClose }: { record: RecordValue; onClose: () => void }) {
  const images = Array.isArray(record.images) ? record.images.map(String) : record.image ? [String(record.image)] : [];
  const videos = Array.isArray(record.videos) ? record.videos.map(String) : record.video ? [String(record.video)] : [];
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="project-detail-modal" aria-label="Project preview">
      <header><div><span className="eyebrow">PROJECT SHOWCASE PREVIEW</span><h2>{String(record.title || 'Untitled project')}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close project preview"><X size={18}/></button></header>
      {images[0] && <img className="project-detail-hero" src={images[0]} alt={String(record.title || 'Project')} />}
      <div className="project-detail-copy"><span className="preview-category">{String(record.category || 'PROJECT')}</span><p>{String(record.desc || record.description || 'No description provided.')}</p><div className="preview-tags">{(Array.isArray(record.tags) ? record.tags : []).map((tag, index) => <span key={`${String(tag)}-${index}`}>{String(tag)}</span>)}</div>{Boolean(record.link) && <a className="secondary" href={String(record.link)} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open project link</a>}</div>
      {videos.length > 0 && <div className="project-detail-videos">{videos.map((url, index) => <video key={`${url}-${index}`} src={url} controls preload="metadata" aria-label={`Project video ${index + 1}`}/>)}</div>}
    </section>
  </div>;
}

function WorkflowDetailDialog({ record, onClose, onOpenEnquiries }: { record: RecordValue; onClose: () => void; onOpenEnquiries: () => void }) {
  const tags = Array.isArray(record.tags) ? record.tags : [];
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-detail-modal">
    <header><div><span className="eyebrow">N8N WORKFLOW PREVIEW</span><h2>{getSummary(record)}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close workflow preview"><X size={18}/></button></header>
    <WorkflowCanvas value={record.workflowJson} />
    <div className="workflow-detail-copy"><span className="workflow-category-pill">{String(record.category || 'Automation')}</span><p>{String(record.desc || record.description || 'No workflow description provided.')}</p><div className="preview-tags">{tags.map((tag, index) => <span key={`${String(tag)}-${index}`}>{String(tag)}</span>)}</div><div className="workflow-detail-actions">{Boolean(record.testWorkflowUrl) && <a className="secondary" href={String(record.testWorkflowUrl)} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Test workflow</a>}<span>{record.allowClientRequest ? 'Client inquiry form enabled' : 'Client inquiry form disabled'}</span><button className="secondary" onClick={onOpenEnquiries}><Users size={14}/> View client enquiries</button></div></div>
  </section></div>;
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
  const [messageView, setMessageView] = useState<'all' | 'contact' | 'service' | 'legacy'>('all');
  const [serviceCategory, setServiceCategory] = useState('all');
  const [projectType, setProjectType] = useState<'all' | 'main' | 'portfolio' | 'figma' | 'client'>('all');
  const [workflowCategory, setWorkflowCategory] = useState('all');
  const [editor, setEditor] = useState<RecordValue | null | 'new'>(null);
  const [viewingProject, setViewingProject] = useState<RecordValue | null>(null);
  const [viewingWorkflow, setViewingWorkflow] = useState<RecordValue | null>(null);
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
    const classification = getMessageClassification(record);
    if (active === 'messages' && messageView !== 'all' && classification !== messageView) return false;
    if (active === 'messages' && messageView === 'service' && serviceCategory !== 'all' && String(record.service || '') !== serviceCategory) return false;
    if (active === 'projects' && projectType !== 'all' && String(record.type || 'main').toLowerCase() !== projectType) return false;
    if (active === 'n8n_projects' && workflowCategory !== 'all' && String(record.category || 'Other') !== workflowCategory) return false;
    const q = search.toLowerCase().trim();
    return !q || JSON.stringify(record).toLowerCase().includes(q);
  }), [records, search, showDeleted, active, messageView, serviceCategory, projectType, workflowCategory]);

  const dashboardCounts = useMemo(() => ({
    total: Object.values(counts).reduce((total, value) => total + (value || 0), 0),
    leads: counts.messages || 0, projects: counts.projects || 0, automations: counts.n8n_projects || 0
  }), [counts]);
  const serviceCategories = useMemo(() => Array.from(new Set(records
    .filter(record => getMessageClassification(record) === 'service')
    .map(record => String(record.service || 'Other service')))), [records]);
  const workflowCategories = useMemo(() => Array.from(new Set(records
    .filter(record => !record.isDeleted)
    .map(record => String(record.category || 'Other')))), [records]);

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
      const refreshed = auth?.currentUser;
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

  async function signOutUser() { if (auth) await signOut(auth); setRecords([]); setCounts({}); }

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
          <div className="toolbar"><div className="searchbox"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${current.title.toLowerCase()}…`}/>{search && <button className="clear-search" onClick={() => setSearch('')}><X size={14}/></button>}</div><div className="toolbar-right">{active === 'messages' && <div className="message-view-switch"><button className={messageView === 'all' ? 'filter-chip selected' : 'filter-chip'} onClick={() => setMessageView('all')}>All ({records.filter(item => !item.isDeleted).length})</button><button className={messageView === 'contact' ? 'filter-chip selected' : 'filter-chip'} onClick={() => setMessageView('contact')}>Contact</button><button className={messageView === 'service' ? 'filter-chip selected' : 'filter-chip'} onClick={() => { setMessageView('service'); setServiceCategory('all'); }}>Services</button><button className={messageView === 'legacy' ? 'filter-chip selected' : 'filter-chip'} onClick={() => setMessageView('legacy')}>Legacy</button></div>}{active === 'messages' && messageView === 'service' && <select aria-label="Filter service category" className="service-category-select" value={serviceCategory} onChange={event => setServiceCategory(event.target.value)}><option value="all">All services ({serviceCategories.length})</option>{serviceCategories.map(category => <option key={category} value={category}>{category}</option>)}</select>}<button className={showDeleted ? 'filter-chip selected' : 'filter-chip'} onClick={() => setShowDeleted(!showDeleted)}><Trash2 size={14}/>{showDeleted ? 'Recycle bin' : 'Active records'}</button><button className="export-button" onClick={() => exportRecords('json')}><FileJson2 size={15}/> JSON</button><button className="export-button" onClick={() => exportRecords('csv')}><ArrowDownToLine size={15}/> CSV</button></div></div>

          {loading ? <div className="empty-state"><LoaderCircle className="spin" size={28}/><strong>Loading records</strong><span>Securely requesting Firestore data…</span></div> :
          apiStatus === 'error' && !records.length ? <div className="empty-state"><CircleAlert size={28}/><strong>API setup required</strong><span>Check the Vercel server logs and required environment variables.</span><button className="secondary" onClick={() => void loadRecords(active)}><RefreshCw size={15}/> Try again</button></div> :
          visible.length === 0 ? <div className="empty-state"><Database size={29}/><strong>{showDeleted ? 'Recycle bin is empty' : 'No records found'}</strong><span>{search ? 'Try a different search phrase.' : 'Add a record or wait for the public website to receive new submissions.'}</span>{!showDeleted && <button className="primary" onClick={() => setEditor('new')}><Plus size={16}/> Create first record</button>}</div> :
          active === 'projects' && !showDeleted ? <div className="project-directory">
            <div className="project-category-tabs">{([['all', 'All projects'], ['main', 'Main Projects'], ['portfolio', 'Portfolio Projects'], ['figma', 'Figma Projects'], ['client', 'Client Projects']] as const).map(([value, label]) => <button key={value} type="button" className={projectType === value ? 'project-category-tab active' : 'project-category-tab'} onClick={() => setProjectType(value)}>{label}<span>{records.filter(record => !record.isDeleted && (value === 'all' || String(record.type || 'main').toLowerCase() === value)).length}</span></button>)}</div>
            <div className="project-grid">{visible.map(record => { const images = Array.isArray(record.images) ? record.images : []; const image = String(images[0] || record.image || ''); const tags = Array.isArray(record.tags) ? record.tags : []; return <article className="project-card" key={record.id}><button type="button" className="project-card-preview" onClick={() => setViewingProject(record)} aria-label={`View ${getSummary(record)}`}>{image ? <img src={image} alt="" loading="lazy"/> : <span><BriefcaseBusiness size={26}/><small>No cover image</small></span>}<b>{String(record.type || 'main').toUpperCase()}</b></button><div className="project-card-body"><span className="project-card-category">{String(record.category || 'PROJECT')}</span><h3>{getSummary(record)}</h3><p>{String(record.desc || record.description || 'Project description not added.')}</p><div className="project-card-tags">{tags.slice(0, 4).map((tag, index) => <span key={`${String(tag)}-${index}`}>{String(tag)}</span>)}{tags.length > 4 && <span>+{tags.length - 4}</span>}</div><div className="project-card-actions"><button type="button" className="table-action" onClick={() => setViewingProject(record)}><Eye size={14}/> View</button><button type="button" className="table-action" onClick={() => setEditor(record)}><Pencil size={14}/> Edit</button><button type="button" className="table-action danger" onClick={() => void softDelete(record)} disabled={busy} title="Move to recycle bin"><Trash2 size={14}/></button></div></div></article>; })}</div>
          </div> : active === 'n8n_projects' && !showDeleted ? <div className="workflow-directory">
            <div className="workflow-category-tabs">{['all', ...workflowCategories].map(category => { const label = category === 'all' ? 'All workflows' : category; const categoryCount = category === 'all' ? records.filter(record => !record.isDeleted).length : records.filter(record => !record.isDeleted && String(record.category || 'Other') === category).length; return <button type="button" className={`workflow-category-pill workflow-filter${workflowCategory === category ? ' selected' : ''}`} key={category} onClick={() => setWorkflowCategory(category)}>{label}<span>{categoryCount}</span></button>; })}</div>
            <div className="workflow-grid">{visible.map(record => <article className="workflow-card" key={record.id}><WorkflowCanvas value={record.workflowJson} compact/><div className="workflow-card-copy"><span className="workflow-category-pill">{String(record.category || 'Automation')}</span><h3>{getSummary(record)}</h3><p>{String(record.desc || record.description || 'Workflow description not added.')}</p><div className="project-card-tags">{(Array.isArray(record.tags) ? record.tags : []).slice(0, 5).map((tag, index) => <span key={`${String(tag)}-${index}`}>{String(tag)}</span>)}</div><div className="workflow-card-meta"><span>{Number(record.nodeCount) || 0} nodes</span><span>{record.allowClientRequest ? 'Client form on' : 'Client form off'}</span></div><div className="project-card-actions"><button type="button" className="table-action" onClick={() => setViewingWorkflow(record)}><Eye size={14}/> Preview</button><button type="button" className="table-action" onClick={() => setEditor(record)}><Pencil size={14}/> Edit</button><button type="button" className="table-action danger" onClick={() => void softDelete(record)} disabled={busy} title="Move to recycle bin"><Trash2 size={14}/></button></div></div></article>)}</div>
          </div> : (active === 'messages' || active === 'n8n_project_forms') && !showDeleted ? <div className="lead-directory">{visible.map(record => { const details = isRecordPayload(record.serviceDetails) ? Object.entries(record.serviceDetails) : []; const classification = active === 'n8n_project_forms' ? 'contact' : getMessageClassification(record); const badge = active === 'n8n_project_forms' ? String(record.projectTitle || 'Automation enquiry') : classification === 'service' ? String(record.service || 'Service enquiry') : classification === 'contact' ? 'Contact form' : 'Legacy record'; const otherFields = Object.entries(record).filter(([key, value]) => !['id', 'name', 'email', 'phone', 'service', 'budget', 'message', 'serviceDetails', 'source', 'createdAt', 'updatedAt', 'isDeleted', 'deletedAt'].includes(key) && value !== '' && value !== null && value !== undefined); return <article className="lead-card" key={record.id}><div className="lead-card-heading"><div><span className={`lead-kind ${classification}`}>{badge}</span><h3>{String(record.name || record.email || 'Unknown contact')}</h3></div><span className="timestamp">{pretty(record.createdAt || record.updatedAt)}</span></div><div className="lead-contact-grid">{[['Email', record.email], ['Phone', record.phone], ['Budget', record.budget], ['Service', record.service]].filter(([, value]) => value !== undefined && value !== '').map(([label, value]) => <div key={String(label)}><small>{String(label)}</small><strong>{pretty(value)}</strong></div>)}</div>{Boolean(record.message) && <div className="lead-message"><small>MESSAGE / REQUIREMENTS</small><p>{String(record.message)}</p></div>}{details.length > 0 && <div className="lead-details"><small>SERVICE DETAILS</small><dl>{details.map(([key, value]) => <div key={key}><dt>{titleFromKey(key)}</dt><dd>{pretty(value)}</dd></div>)}</dl></div>}{otherFields.length > 0 && <details className="lead-extra"><summary>Additional submitted fields ({otherFields.length})</summary><dl>{otherFields.map(([key, value]) => <div key={key}><dt>{titleFromKey(key)}</dt><dd>{pretty(value)}</dd></div>)}</dl></details>}<div className="lead-card-actions"><span className="subtle">ID: {record.id}</span><button className="table-action" onClick={() => setEditor(record)}><Pencil size={14}/> Edit</button><button className="table-action danger" onClick={() => void softDelete(record)} disabled={busy}><Trash2 size={14}/> Recycle</button></div></article>; })}</div> : <div className="record-table-wrap"><table className="record-table"><thead><tr><th>RECORD</th><th>PREVIEW</th><th>UPDATED / CREATED</th><th>STATUS</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{visible.map(record => {
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
    {viewingProject && <ProjectDetailDialog record={viewingProject} onClose={() => setViewingProject(null)}/>}
    {viewingWorkflow && <WorkflowDetailDialog record={viewingWorkflow} onClose={() => setViewingWorkflow(null)} onOpenEnquiries={() => { setViewingWorkflow(null); setActive('n8n_project_forms'); }}/>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}
