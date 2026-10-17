import { Bell, BellRing, ChevronRight, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { timeAgo, type LeadEvent } from './notifications';

export function NotificationBell({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button className="notif-bell" onClick={onClick} aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'} title="Notifications">
      {count > 0 ? <BellRing size={17} /> : <Bell size={17} />}
      {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
    </button>
  );
}

export function NotificationBanner({ onAllow, onDismiss }: { onAllow: () => void; onDismiss: () => void }) {
  return (
    <div className="notif-banner" role="status">
      <BellRing size={16} />
      <div>
        <strong>Get pinged for new leads</strong>
        <span>Allow desktop notifications — new enquiries will pop up even when this tab is in the background.</span>
      </div>
      <button className="primary" onClick={onAllow}>Allow</button>
      <button className="icon-btn" onClick={onDismiss} aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}

const COLLECTION_LABEL: Record<LeadEvent['collection'], string> = {
  messages: 'Contact leads',
  n8n_project_forms: 'Automation enquiries',
  projects: 'Projects',
  websites: 'Websites',
};

export function NotificationPanel({
  open,
  events,
  onClose,
  onSelect,
  onClear,
  muted,
  onToggleMute,
}: {
  open: boolean;
  events: LeadEvent[];
  onClose: () => void;
  onSelect: (event: LeadEvent) => void;
  onClear: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  if (!open) return null;
  return (
    <div className="notif-panel-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="notif-panel" aria-label="Notifications">
        <header className="notif-panel-head">
          <div>
            <span className="eyebrow">ACTIVITY</span>
            <h2>Notifications</h2>
          </div>
          <div className="notif-panel-actions">
            <button className="icon-btn" onClick={onToggleMute} title={muted ? 'Unmute alert sound' : 'Mute alert sound'} aria-label={muted ? 'Unmute alert sound' : 'Mute alert sound'}>
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {events.length > 0 && (
              <button className="icon-btn" onClick={onClear} title="Clear all" aria-label="Clear all notifications">
                <Trash2 size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Close notifications"><X size={17} /></button>
          </div>
        </header>
        {events.length === 0 ? (
          <div className="notif-empty">
            <Bell size={26} />
            <strong>All caught up</strong>
            <span>New leads, enquiries and published records will appear here the moment they arrive.</span>
          </div>
        ) : (
          <ul className="notif-list">
            {events.map((event) => (
              <li key={event.key}>
                <button className="notif-item" onClick={() => onSelect(event)}>
                  <span className="notif-dot" />
                  <span className="notif-item-body">
                    <strong>{event.title}</strong>
                    <small>{event.detail}</small>
                    <span className="notif-meta">
                      {COLLECTION_LABEL[event.collection]} · {timeAgo(event.at)}
                    </span>
                  </span>
                  <ChevronRight size={15} className="notif-go" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="notif-panel-foot">
          <span>Watching contact leads, automation enquiries, projects and websites for new entries.</span>
        </footer>
      </aside>
    </div>
  );
}
