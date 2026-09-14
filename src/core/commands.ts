import { cloneGraphDocument, createNodeFromDefinition, getNodeDefinition } from './graph.js';
import { validateGraphDocument } from './validation.js';
import type {
  NodalGraphDocument,
  NodalGraphEdge,
  NodalGraphNode,
  NodalGraphSelection
} from '../types/model.js';
import type { NodalDialect } from '../types/registry.js';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptySelection(): NodalGraphSelection {
  return {
    nodeIds: [],
    edgeIds: []
  };
}

export function addNodeToGraph(
  graph: NodalGraphDocument,
  dialect: NodalDialect,
  input: {
    nodeType: string;
    position: { x: number; y: number };
    config?: Record<string, unknown>;
  }
): { graph: NodalGraphDocument; nodeId: string } {
  const definition = getNodeDefinition(dialect, input.nodeType);

  if (!definition) {
    throw new Error(`Unknown node type "${input.nodeType}" for dialect "${dialect.id}".`);
  }

  const nextGraph = cloneGraphDocument(graph);
  const node = createNodeFromDefinition({
    definition,
    position: input.position,
    config: input.config
  });

  nextGraph.nodes.push(node);
  return { graph: nextGraph, nodeId: node.id };
}

export function updateNodePosition(
  graph: NodalGraphDocument,
  nodeIds: string[],
  delta: { x: number; y: number }
): NodalGraphDocument {
  const nextGraph = cloneGraphDocument(graph);

  for (const node of nextGraph.nodes) {
    if (!nodeIds.includes(node.id)) {
      continue;
    }

    node.position = {
      x: Math.round((node.position.x + delta.x) * 100) / 100,
      y: Math.round((node.position.y + delta.y) * 100) / 100
    };
  }

  return nextGraph;
}

export function updateNodeConfig(
  graph: NodalGraphDocument,
  nodeId: string,
  configPatch: Record<string, unknown>
): NodalGraphDocument {
  const nextGraph = cloneGraphDocument(graph);
  const node = nextGraph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    return graph;
  }

  node.config = {
    ...node.config,
    ...configPatch
  };

  return nextGraph;
}

export function updateNodeMetadata(
  graph: NodalGraphDocument,
  nodeId: string,
  metadataPatch: Partial<
    Pick<NodalGraphNode, 'title' | 'mode' | 'locked' | 'source' | 'badges' | 'appearance' | 'missingDefinition'>
  >
): NodalGraphDocument {
  const nextGraph = cloneGraphDocument(graph);
  const node = nextGraph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    return graph;
  }

  if (metadataPatch.title !== undefined) {
    node.title = metadataPatch.title;
  }

  if (metadataPatch.mode !== undefined) {
    node.mode = metadataPatch.mode;
  }

  if (metadataPatch.locked !== undefined) {
    node.locked = metadataPatch.locked;
  }

  if (metadataPatch.source !== undefined) {
    node.source = metadataPatch.source;
  }

  if (metadataPatch.badges !== undefined) {
    node.badges = metadataPatch.badges;
  }

  if (metadataPatch.appearance !== undefined) {
    node.appearance = metadataPatch.appearance;
  }

  if (metadataPatch.missingDefinition !== undefined) {
    node.missingDefinition = metadataPatch.missingDefinition;
  }

  return nextGraph;
}

export function removeNodesFromGraph(graph: NodalGraphDocument, nodeIds: string[]): NodalGraphDocument {
  const nextGraph = cloneGraphDocument(graph);
  nextGraph.nodes = nextGraph.nodes.filter((node) => !nodeIds.includes(node.id));
  nextGraph.edges = nextGraph.edges.filter(
    (edge) => !nodeIds.includes(edge.sourceNodeId) && !nodeIds.includes(edge.targetNodeId)
  );
  nextGraph.groups = nextGraph.groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((nodeId) => !nodeIds.includes(nodeId))
    }))
    .filter((group) => group.nodeIds.length > 0);
  return nextGraph;
}

export function duplicateNodesInGraph(
  graph: NodalGraphDocument,
  nodeIds: string[]
): { graph: NodalGraphDocument; duplicatedNodeIds: string[] } {
  const nextGraph = cloneGraphDocument(graph);
  const sourceNodes = nextGraph.nodes.filter((node) => nodeIds.includes(node.id));
  const idMap = new Map<string, string>();

  const duplicatedNodes = sourceNodes.map((node) => {
    const nextNodeId = createId('node');
    idMap.set(node.id, nextNodeId);

    return {
      ...node,
      id: nextNodeId,
      position: {
        x: node.position.x + 48,
        y: node.position.y + 48
      },
      inputs: node.inputs.map((port) => ({
        ...port,
        nodeId: nextNodeId
      })),
      outputs: node.outputs.map((port) => ({
        ...port,
        nodeId: nextNodeId
      })),
      state: {
        status: 'idle' as const,
        message: null,
        outputs: {}
      }
    };
  });

  nextGraph.nodes.push(...duplicatedNodes);

  const duplicatedEdges: NodalGraphEdge[] = nextGraph.edges
    .filter((edge) => idMap.has(edge.sourceNodeId) && idMap.has(edge.targetNodeId))
    .map((edge) => ({
      ...edge,
      id: createId('edge'),
      sourceNodeId: idMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeId: idMap.get(edge.targetNodeId) ?? edge.targetNodeId
    }));

  nextGraph.edges.push(...duplicatedEdges);

  return {
    graph: nextGraph,
    duplicatedNodeIds: duplicatedNodes.map((node) => node.id)
  };
}

export function addEdgeToGraph(
  graph: NodalGraphDocument,
  dialect: NodalDialect,
  input: Omit<NodalGraphEdge, 'id'>
): { graph: NodalGraphDocument; edgeId: string; validation: ReturnType<typeof validateGraphDocument> } {
  const nextGraph = cloneGraphDocument(graph);
  const edgeId = createId('edge');
  nextGraph.edges.push({
    id: edgeId,
    ...input
  });

  const validation = validateGraphDocument(nextGraph, dialect);

  if (!validation.valid) {
    const edgeHasError = validation.issues.some((issue) => issue.edgeId === edgeId && issue.severity === 'error');

    if (edgeHasError) {
      return {
        graph,
        edgeId,
        validation
      };
    }
  }

  return { graph: nextGraph, edgeId, validation };
}

export function removeEdgeFromGraph(graph: NodalGraphDocument, edgeId: string): NodalGraphDocument {
  const nextGraph = cloneGraphDocument(graph);
  nextGraph.edges = nextGraph.edges.filter((edge) => edge.id !== edgeId);
  return nextGraph;
}
