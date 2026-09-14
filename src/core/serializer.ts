import type { NodalGraphDocument, NodalGraphNode } from '../types/model.js';

function normalizeNode(node: NodalGraphNode): NodalGraphNode {
  return {
    ...node,
    mode: node.mode ?? 'always',
    locked: node.locked ?? false,
    source: node.source ?? null,
    badges: node.badges ?? [],
    appearance: {
      color: node.appearance?.color ?? null
    },
    missingDefinition: node.missingDefinition ?? false
  };
}

export function serializeGraphDocument(graph: NodalGraphDocument): string {
  return JSON.stringify(graph, null, 2);
}

export function parseGraphDocument(source: string): NodalGraphDocument {
  const parsed = JSON.parse(source) as Partial<NodalGraphDocument>;

  if (parsed.version !== 1 || typeof parsed.id !== 'string' || typeof parsed.dialect !== 'string') {
    throw new Error('Unsupported or invalid graph document.');
  }

  return {
    id: parsed.id,
    version: 1,
    dialect: parsed.dialect,
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes.map((node) => normalizeNode(node as NodalGraphNode)) : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    metadata: parsed.metadata ?? {}
  };
}
