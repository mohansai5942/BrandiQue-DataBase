import { isRecordPayload } from './security.ts';

export type DashboardCollection = 'messages' | 'projects' | 'settings' | 'websites' | 'n8n_projects' | 'n8n_project_forms' | 'prompts';
export type RecordOperation = 'create' | 'update';

export function prepareCreateRecord(value: Record<string, unknown>, now = new Date().toISOString()): Record<string, unknown> {
  const { id: _ignoredId, ...fields } = value;
  return { ...fields, updatedAt: now, createdAt: fields.createdAt || now };
}

export function prepareUpdateRecord(value: Record<string, unknown>, now = new Date().toISOString()): Record<string, unknown> {
  const { id: _ignoredId, ...fields } = value;
  return { ...fields, updatedAt: now };
}

export function prepareSoftDelete(now = new Date().toISOString()): Record<string, unknown> {
  return { isDeleted: true, deletedAt: now, updatedAt: now };
}

export function isDashboardCollection(value: string): value is DashboardCollection {
  return value === 'messages' || value === 'projects' || value === 'settings' || value === 'websites'
    || value === 'n8n_projects' || value === 'n8n_project_forms' || value === 'prompts';
}

function textValue(value: unknown): value is string {
  return typeof value === 'string';
}

function emailValue(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function validateRecordPayload(collection: DashboardCollection, value: unknown, operation: RecordOperation): string | null {
  if (!isRecordPayload(value)) return 'Body must be a JSON object.';
  const required = (key: string, label: string, max: number): string | null => {
    const field = value[key];
    if (operation === 'create' && (!textValue(field) || !field.trim())) return `${label} is required.`;
    if (field !== undefined && (!textValue(field) || field.length > max)) return `${label} must be text with at most ${max} characters.`;
    return null;
  };

  if (collection === 'projects') {
    const title = required('title', 'Project title', 180);
    if (title) return title;
    for (const [field, max] of [['images', 10], ['videos', 5]] as const) {
      const media = value[field];
      if (media !== undefined && (!Array.isArray(media) || media.length > max || !media.every(item => textValue(item) && item.length <= 5000))) {
        return `${field} must be a list of up to ${max} media URLs.`;
      }
    }
    for (const field of ['image', 'video', 'link']) {
      if (value[field] !== undefined && (!textValue(value[field]) || value[field].length > 5000)) return `${field} must be a URL string.`;
    }
  }

  if (collection === 'messages' || collection === 'n8n_project_forms') {
    const name = required('name', 'Name', 120);
    if (name) return name;
    if (value.email !== undefined || operation === 'create') {
      if (!textValue(value.email) || !emailValue(value.email)) return 'A valid email address is required.';
    }
  }

  if (collection === 'websites') {
    const name = required('name', 'Website name', 160);
    if (name) return name;
    const url = required('url', 'Website URL', 2048);
    if (url) return url;
  }

  if (collection === 'n8n_projects') {
    const title = required('title', 'Workflow title', 180);
    if (title) return title;
    if (value.workflowJson !== undefined) {
      if (!textValue(value.workflowJson) || value.workflowJson.length > 200_000) return 'Workflow JSON must be text under 200 KB.';
      try {
        const workflow: unknown = JSON.parse(value.workflowJson);
        if (!isRecordPayload(workflow) || !Array.isArray(workflow.nodes)) return 'Workflow JSON must contain a nodes array.';
      } catch {
        return 'Workflow JSON must contain valid JSON syntax.';
      }
    }
  }

  if (collection === 'prompts') {
    const title = required('title', 'Prompt title', 180);
    if (title) return title;
    const prompt = required('prompt', 'Prompt content', 100_000);
    if (prompt) return prompt;
  }

  return null;
}
