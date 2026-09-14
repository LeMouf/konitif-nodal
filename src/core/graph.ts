import type { NodalGraphDocument, NodalGraphGroup, NodalGraphNode, NodalGraphPort } from '../types/model.js';
import type { NodalDialect, NodalNodeDefinition, NodalNodeDefinitionPortTemplate } from '../types/registry.js';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Math.random().toString(36).slice(2, 10)}`;
}

function instantiatePorts(
  nodeId: string,
  direction: 'input' | 'output',
  templates: NodalNodeDefinitionPortTemplate[]
): NodalGraphNode['inputs'] {
  return templates.map((template) => ({
    id: template.id,
    nodeId,
    label: template.label,
    direction,
    dataType: template.dataType,
    mode: template.mode
  }));
}

export function createNodalGraphDocument(input: {
  dialect: string;
  id?: string;
  metadata?: Record<string, unknown>;
}): NodalGraphDocument {
  return {
    id: input.id ?? createId('graph'),
    version: 1,
    dialect: input.dialect,
    nodes: [],
    edges: [],
    groups: [],
    metadata: input.metadata ?? {}
  };
}

export function createNodeFromDefinition(input: {
  definition: NodalNodeDefinition;
  position: { x: number; y: number };
  config?: Record<string, unknown>;
}): NodalGraphNode {
  const nodeId = createId('node');

  return {
    id: nodeId,
    type: input.definition.type,
    title: input.definition.title,
    mode: 'always',
    locked: false,
    source: null,
    badges: [],
    appearance: {
      color: null
    },
    missingDefinition: false,
    position: input.position,
    inputs: instantiatePorts(nodeId, 'input', input.definition.inputs),
    outputs: instantiatePorts(nodeId, 'output', input.definition.outputs),
    config: {
      ...input.definition.defaultConfig,
      ...(input.config ?? {})
    },
    state: {
      status: 'idle',
      message: null,
      outputs: {}
    }
  };
}

export function getNodeDefinition(dialect: NodalDialect, nodeType: string): NodalNodeDefinition | null {
  return dialect.nodeRegistry.find((definition) => definition.type === nodeType) ?? null;
}

function synchronizeNodePorts(
  nodeId: string,
  direction: NodalGraphPort['direction'],
  currentPorts: NodalGraphPort[],
  templates: NodalNodeDefinitionPortTemplate[]
): { ports: NodalGraphPort[]; changed: boolean } {
  const currentPortsById = new Map(currentPorts.map((port) => [port.id, port]));
  const templateIds = new Set(templates.map((template) => template.id));
  let changed = currentPorts.length !== templates.length;

  const synchronizedPorts = templates.map((template, index) => {
    const currentPort = currentPortsById.get(template.id);
    const nextPort: NodalGraphPort = {
      ...(currentPort ?? {}),
      id: template.id,
      nodeId,
      label: template.label,
      direction,
      dataType: template.dataType,
      mode: template.mode
    };

    if (
      !currentPort ||
      currentPorts[index]?.id !== template.id ||
      currentPort.nodeId !== nextPort.nodeId ||
      currentPort.label !== nextPort.label ||
      currentPort.direction !== nextPort.direction ||
      currentPort.dataType !== nextPort.dataType ||
      currentPort.mode !== nextPort.mode
    ) {
      changed = true;
    }

    return nextPort;
  });

  const extraPorts = currentPorts
    .filter((port) => !templateIds.has(port.id))
    .map((port) => {
      const nextPort = {
        ...port,
        nodeId,
        direction
      };

      if (port.nodeId !== nextPort.nodeId || port.direction !== nextPort.direction) {
        changed = true;
      }

      return nextPort;
    });

  if (extraPorts.length > 0) {
    changed = true;
  }

  return {
    ports: [...synchronizedPorts, ...extraPorts],
    changed
  };
}

export function synchronizeGraphNodePortsWithDialect(
  graph: NodalGraphDocument,
  dialect: NodalDialect
): NodalGraphDocument {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    const definition = getNodeDefinition(dialect, node.type);

    if (!definition) {
      return node;
    }

    const inputs = synchronizeNodePorts(node.id, 'input', node.inputs, definition.inputs);
    const outputs = synchronizeNodePorts(node.id, 'output', node.outputs, definition.outputs);

    if (!inputs.changed && !outputs.changed) {
      return node;
    }

    changed = true;
    return {
      ...node,
      inputs: inputs.ports,
      outputs: outputs.ports
    };
  });

  return changed
    ? {
        ...graph,
        nodes
      }
    : graph;
}

export function cloneGraphDocument(graph: NodalGraphDocument): NodalGraphDocument {
  return structuredClone(graph);
}

function normalizeGroupNodeIds(graph: NodalGraphDocument, nodeIds: string[]): string[] {
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  return [...new Set(nodeIds)].filter((nodeId) => graphNodeIds.has(nodeId));
}

function removeNodesFromGroups(groups: NodalGraphGroup[], nodeIds: string[]): NodalGraphGroup[] {
  const nodeIdSet = new Set(nodeIds);

  return groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((nodeId) => !nodeIdSet.has(nodeId))
    }))
    .filter((group) => group.nodeIds.length > 0);
}

export function createGraphGroupFromNodes(
  graph: NodalGraphDocument,
  nodeIds: string[],
  input: {
    label?: string;
    color?: string;
  } = {}
): { graph: NodalGraphDocument; groupId: string | null } {
  const normalizedNodeIds = normalizeGroupNodeIds(graph, nodeIds);

  if (normalizedNodeIds.length === 0) {
    return {
      graph,
      groupId: null
    };
  }

  const groupId = createId('group');

  return {
    groupId,
    graph: {
      ...graph,
      groups: [
        ...removeNodesFromGroups(graph.groups, normalizedNodeIds),
        {
          id: groupId,
          label: input.label?.trim() || 'Group',
          nodeIds: normalizedNodeIds,
          ...(input.color ? { color: input.color } : {})
        }
      ]
    }
  };
}

export function updateGraphGroupMetadata(
  graph: NodalGraphDocument,
  groupId: string,
  patch: Partial<Pick<NodalGraphGroup, 'label' | 'color'>>
): NodalGraphDocument {
  let changed = false;
  const groups = graph.groups.map((group) => {
    if (group.id !== groupId) {
      return group;
    }

    changed = true;
    return {
      ...group,
      ...(typeof patch.label === 'string' ? { label: patch.label.trim() || group.label } : {}),
      ...(typeof patch.color === 'string' ? { color: patch.color.trim() || undefined } : {})
    };
  });

  return changed
    ? {
        ...graph,
        groups
      }
    : graph;
}

export function removeGraphGroups(graph: NodalGraphDocument, groupIds: string[]): NodalGraphDocument {
  const groupIdSet = new Set(groupIds);
  const groups = graph.groups.filter((group) => !groupIdSet.has(group.id));

  return groups.length === graph.groups.length
    ? graph
    : {
        ...graph,
        groups
      };
}

export function ungroupGraphNodes(graph: NodalGraphDocument, nodeIds: string[]): NodalGraphDocument {
  const normalizedNodeIds = normalizeGroupNodeIds(graph, nodeIds);

  if (normalizedNodeIds.length === 0) {
    return graph;
  }

  const groups = removeNodesFromGroups(graph.groups, normalizedNodeIds);

  return groups.length === graph.groups.length && groups.every((group, index) => group === graph.groups[index])
    ? graph
    : {
        ...graph,
        groups
      };
}
