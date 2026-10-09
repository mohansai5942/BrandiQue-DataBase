import { useMemo, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { isRecordPayload } from '../api/security';

type WorkflowNode = { id: string; name: string; type: string; position: [number, number]; x: number; y: number };
type WorkflowEdge = { id: string; from: string; to: string };
type WorkflowLayout = { nodes: WorkflowNode[]; edges: WorkflowEdge[]; width: number; height: number; error: string };

function getPosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number') return null;
  return [value[0], value[1]];
}

function createLayout(raw: string): WorkflowLayout {
  let workflow: unknown;
  try { workflow = JSON.parse(raw || '{}'); } catch { return { nodes: [], edges: [], width: 600, height: 300, error: 'Workflow JSON has a syntax error.' }; }
  if (!isRecordPayload(workflow) || !Array.isArray(workflow.nodes)) return { nodes: [], edges: [], width: 600, height: 300, error: 'Workflow JSON must contain a nodes array.' };
  const rawNodes = workflow.nodes.filter(isRecordPayload);
  const positioned = rawNodes.map(node => getPosition(node.position));
  const hasCoordinates = positioned.some(position => position !== null);
  const xs = positioned.flatMap(position => position ? [position[0]] : []);
  const ys = positioned.flatMap(position => position ? [position[1]] : []);
  const minX = Math.min(0, ...xs);
  const minY = Math.min(0, ...ys);
  const nodes = rawNodes.map((node, index) => {
    const original = positioned[index];
    const fallbackX = 40 + (index % 3) * 215;
    const fallbackY = 50 + Math.floor(index / 3) * 130;
    const x = hasCoordinates && original ? 40 + (original[0] - minX) * 0.65 : fallbackX;
    const y = hasCoordinates && original ? 45 + (original[1] - minY) * 0.55 : fallbackY;
    return {
      id: typeof node.id === 'string' ? node.id : `node-${index}`,
      name: typeof node.name === 'string' && node.name ? node.name : `Node ${index + 1}`,
      type: typeof node.type === 'string' && node.type ? node.type.replace(/^n8n-nodes-base\./, '') : 'Workflow node',
      position: original || [0, 0], x, y,
    };
  });
  const nodeByName = new Map(nodes.map(node => [node.name, node.id]));
  const edges: WorkflowEdge[] = [];
  if (isRecordPayload(workflow.connections)) {
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      if (!isRecordPayload(outputs) || !nodeByName.has(source)) continue;
      for (const connections of Object.values(outputs)) {
        if (!Array.isArray(connections)) continue;
        for (const output of connections) {
          if (!Array.isArray(output)) continue;
          for (const connection of output) {
            if (!isRecordPayload(connection) || typeof connection.node !== 'string') continue;
            const targetId = nodeByName.get(connection.node);
            const sourceId = nodeByName.get(source);
            if (targetId && sourceId) edges.push({ id: `${sourceId}-${targetId}-${edges.length}`, from: sourceId, to: targetId });
          }
        }
      }
    }
  }
  const maxX = Math.max(600, ...nodes.map(node => node.x + 180));
  const maxY = Math.max(300, ...nodes.map(node => node.y + 90));
  return { nodes, edges, width: maxX, height: maxY, error: '' };
}

export function WorkflowCanvas({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const [zoom, setZoom] = useState(1);
  const raw = typeof value === 'string' ? value : JSON.stringify(value || { nodes: [], connections: {} });
  const layout = useMemo(() => createLayout(raw), [raw]);
  const nodeById = new Map(layout.nodes.map(node => [node.id, node]));
  const frameHeight = compact ? 180 : 285;
  return <div className={`workflow-canvas-frame${compact ? ' compact' : ''}`} style={{ height: frameHeight }}>
    <div className="workflow-canvas-toolbar"><span>{layout.error ? 'Invalid workflow' : `${layout.nodes.length} nodes · ${layout.edges.length} connections`}</span><div><button type="button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(.65, value - .15))}><Minus size={13}/></button><button type="button" aria-label="Reset zoom" onClick={() => setZoom(1)}><Maximize2 size={13}/></button><button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.7, value + .15))}><Plus size={13}/></button></div></div>
    {layout.error ? <div className="workflow-canvas-error">{layout.error}</div> : layout.nodes.length === 0 ? <div className="workflow-canvas-empty">Workflow preview appears here when you add nodes.</div> : <div className="workflow-canvas-scroll"><div className="workflow-canvas-scene" style={{ width: layout.width * zoom, height: layout.height * zoom }}><div className="workflow-canvas-content" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})`}}><svg className="workflow-connections" width={layout.width} height={layout.height} aria-hidden="true"><defs><marker id="workflow-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#f59e0b"/></marker></defs>{layout.edges.map(edge => { const from = nodeById.get(edge.from); const to = nodeById.get(edge.to); return from && to ? <path key={edge.id} d={`M ${from.x + 170} ${from.y + 33} C ${from.x + 220} ${from.y + 33}, ${to.x - 45} ${to.y + 33}, ${to.x} ${to.y + 33}`} markerEnd="url(#workflow-arrowhead)"/> : null; })}</svg>{layout.nodes.map(node => <article className="workflow-canvas-node" key={node.id} style={{ left: node.x, top: node.y }}><span className="workflow-canvas-node-icon">{node.type.slice(0, 1).toUpperCase()}</span><div><strong>{node.name}</strong><small>{node.type}</small></div><span className="workflow-node-port input"/><span className="workflow-node-port output"/></article>)}</div></div></div>}
  </div>;
}
