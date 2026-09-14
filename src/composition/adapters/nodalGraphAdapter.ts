import { createEmptyWorkflow, createMinimalModule } from '@konitif/composition';
import type {
  CompositionValueType,
  Connection,
  Contract,
  Domain,
  Module,
  Port,
  RuntimeStateStatus,
  Workflow
} from '@konitif/composition';
import type {
  NodalGraphDocument,
  NodalGraphNode,
  NodalGraphNodeAppearance,
  NodalGraphNodeBadge,
  NodalGraphNodeSource,
  NodalGraphPort,
  NodalGraphValueType,
  NodalNodeExecutionStatus,
  NodalNodeMode
} from '../../types/model.js';

export interface NodalGraphProjectionMetadata {
  kind: 'nodal-graph';
  graphId: string;
  dialect: string;
  graphMetadata: Record<string, unknown>;
  nodes: Record<string, NodalGraphNodeProjectionMetadata>;
  groups: Record<string, NodalGraphGroupProjectionMetadata>;
}

export interface NodalGraphNodeProjectionMetadata {
  position: { x: number; y: number };
  mode: NodalNodeMode;
  locked: boolean;
  source?: NodalGraphNodeSource | null;
  badges?: NodalGraphNodeBadge[];
  appearance?: NodalGraphNodeAppearance;
  missingDefinition?: boolean;
}

export interface NodalGraphGroupProjectionMetadata {
  color?: string;
}

export interface NodalGraphWorkflowMetadata {
  projectionMetadata?: NodalGraphProjectionMetadata;
  [key: string]: unknown;
}

export function nodalGraphToWorkflow(graph: NodalGraphDocument): Workflow {
  const workflow = createEmptyWorkflow({
    id: createWorkflowIdFromGraphId(graph.id),
    title: resolveWorkflowTitle(graph),
    asset: {
      version: String(graph.metadata.version ?? '0.1.0'),
      provider: 'workbench-nodal',
      tags: ['composition-staging', 'nodal-graph-adapter']
    },
    metadata: {
      sourceDialect: graph.dialect,
      projectionMetadata: createNodalGraphProjectionMetadata(graph)
    } satisfies NodalGraphWorkflowMetadata
  });
  const modules = graph.nodes.map(nodalNodeToModule);
  const connections = graph.edges.map(nodalEdgeToConnection);
  const domains = graph.groups.map(nodalGroupToDomain);
  const contracts = collectWorkflowContracts(modules);

  return {
    ...workflow,
    composition: {
      ...workflow.composition,
      modules,
      connections,
      domains,
      contracts
    }
  };
}

export function workflowToNodalGraph(workflow: Workflow): NodalGraphDocument {
  const projectionMetadata = readNodalGraphProjectionMetadata(workflow);

  return {
    id: projectionMetadata?.graphId ?? workflow.id,
    version: 1,
    dialect: projectionMetadata?.dialect ?? String(workflow.metadata?.sourceDialect ?? 'composition.staging'),
    nodes: workflow.composition.modules.map((module, index) =>
      moduleToNodalNode(module, projectionMetadata?.nodes[module.id], index)
    ),
    edges: workflow.composition.connections.map(connectionToNodalEdge),
    groups: workflow.composition.domains.map((domain) => ({
      id: domain.id,
      label: domain.title,
      nodeIds: [...domain.moduleIds],
      color: projectionMetadata?.groups[domain.id]?.color
    })),
    metadata: {
      ...(projectionMetadata?.graphMetadata ?? {}),
      workflowId: workflow.id,
      compositionId: workflow.composition.id,
      graphIsProjection: true
    }
  };
}

export function nodalNodeToModule(node: NodalGraphNode): Module {
  return createMinimalModule({
    id: node.id,
    kind: node.type,
    title: node.title,
    asset: {
      provider: node.source?.label ?? node.source?.packageId ?? 'workbench-nodal',
      packageId: node.source?.packageId ?? null,
      tags: ['nodal-adapter']
    },
    ports: [...node.inputs, ...node.outputs].map((port) =>
      nodalPortToCompositionPort(port, {
        acceptsAnyValue: node.type === 'graph:output' && port.direction === 'input'
      })
    ),
    metadata: {
      config: structuredClone(node.config)
    }
  });
}

export function moduleToNodalNode(
  module: Module,
  projectionMetadata: NodalGraphNodeProjectionMetadata | undefined,
  index = 0
): NodalGraphNode {
  return {
    id: module.id,
    type: module.kind,
    title: module.title,
    mode: projectionMetadata?.mode ?? 'always',
    locked: projectionMetadata?.locked ?? false,
    source: projectionMetadata ? projectionMetadata.source ?? null : createNodeSourceFromModule(module),
    badges: projectionMetadata?.badges ?? [],
    appearance: projectionMetadata?.appearance ?? { color: null },
    missingDefinition: projectionMetadata?.missingDefinition ?? module.runtimeState.status === 'missing',
    position: projectionMetadata?.position ?? createDefaultNodePosition(index),
    inputs: module.ports
      .filter((port) => port.direction === 'input')
      .map(compositionPortToNodalPort),
    outputs: module.ports
      .filter((port) => port.direction === 'output')
      .map(compositionPortToNodalPort),
    config: readModuleConfig(module),
    state: {
      status: mapRuntimeStatusToNodalStatus(module.runtimeState.status),
      message: module.runtimeState.message ?? null,
      outputs: module.runtimeState.outputs ?? {}
    }
  };
}

export function nodalPortToCompositionPort(
  port: NodalGraphPort,
  options: { acceptsAnyValue?: boolean } = {}
): Omit<Port, 'moduleId'> {
  const valueType = options.acceptsAnyValue ? 'unknown' : port.dataType;
  const contract: Contract = {
    id: `contract.${port.nodeId}.${port.id}`,
    kind: port.mode === 'event' ? 'event' : port.mode === 'control' ? 'control' : 'data',
    valueType,
    mode: port.mode,
    semanticType: options.acceptsAnyValue ? null : `${port.dataType}.${port.mode}`,
    required: port.direction === 'input',
    multiple: false
  };

  return {
    id: port.id,
    label: port.label,
    direction: port.direction,
    contract
  };
}

export function compositionPortToNodalPort(port: Port): NodalGraphPort {
  return {
    id: port.id,
    nodeId: port.moduleId,
    label: port.label,
    direction: port.direction,
    dataType: mapCompositionValueTypeToNodalValueType(port.contract.valueType),
    mode: port.contract.mode
  };
}

export function nodalEdgeToConnection(edge: NodalGraphDocument['edges'][number]): Connection {
  return {
    id: edge.id,
    source: {
      moduleId: edge.sourceNodeId,
      portId: edge.sourcePortId
    },
    target: {
      moduleId: edge.targetNodeId,
      portId: edge.targetPortId
    }
  };
}

export function connectionToNodalEdge(connection: Connection): NodalGraphDocument['edges'][number] {
  return {
    id: connection.id,
    sourceNodeId: connection.source.moduleId,
    sourcePortId: connection.source.portId,
    targetNodeId: connection.target.moduleId,
    targetPortId: connection.target.portId
  };
}

export function nodalGroupToDomain(group: NodalGraphDocument['groups'][number]): Domain {
  return {
    id: group.id,
    title: group.label,
    moduleIds: [...group.nodeIds]
  };
}

function createNodalGraphProjectionMetadata(graph: NodalGraphDocument): NodalGraphProjectionMetadata {
  return {
    kind: 'nodal-graph',
    graphId: graph.id,
    dialect: graph.dialect,
    graphMetadata: { ...graph.metadata },
    nodes: Object.fromEntries(
      graph.nodes.map((node) => [
        node.id,
        {
          position: { ...node.position },
          mode: node.mode,
          locked: node.locked,
          source: node.source ?? null,
          badges: node.badges ? [...node.badges] : [],
          appearance: node.appearance ? { ...node.appearance } : { color: null },
          missingDefinition: node.missingDefinition ?? false
        } satisfies NodalGraphNodeProjectionMetadata
      ])
    ),
    groups: Object.fromEntries(
      graph.groups.map((group) => [
        group.id,
        {
          color: group.color
        } satisfies NodalGraphGroupProjectionMetadata
      ])
    )
  };
}

function readNodalGraphProjectionMetadata(workflow: Workflow): NodalGraphProjectionMetadata | null {
  const metadata = workflow.metadata as NodalGraphWorkflowMetadata | undefined;
  const projectionMetadata = metadata?.projectionMetadata;

  return projectionMetadata?.kind === 'nodal-graph' ? projectionMetadata : null;
}

function collectWorkflowContracts(modules: readonly Module[]): Contract[] {
  const byId = new Map<string, Contract>();

  for (const module of modules) {
    for (const port of module.ports) {
      byId.set(port.contract.id, port.contract);
    }
  }

  return [...byId.values()];
}

function resolveWorkflowTitle(graph: NodalGraphDocument): string {
  const title = graph.metadata.title;

  return typeof title === 'string' && title.trim() ? title.trim() : `Nodal Workflow ${graph.id}`;
}

function createWorkflowIdFromGraphId(graphId: string): string {
  const normalized = graphId
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/^[^a-zA-Z0-9]+/, '')
    .replace(/-+$/g, '');

  return normalized || 'workflow.nodal-graph';
}

function createNodeSourceFromModule(module: Module): NodalGraphNodeSource | null {
  const provider = module.asset.provider ?? module.asset.packageId;

  if (!provider) {
    return null;
  }

  return {
    label: provider,
    kind: module.kind,
    packageId: module.asset.packageId ?? null
  };
}

function createDefaultNodePosition(index: number): { x: number; y: number } {
  return {
    x: index * 240,
    y: 0
  };
}

function readModuleConfig(module: Module): Record<string, unknown> {
  const config = module.metadata?.config;

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }

  return structuredClone(config) as Record<string, unknown>;
}

function mapRuntimeStatusToNodalStatus(status: RuntimeStateStatus): NodalNodeExecutionStatus {
  if (status === 'ready' || status === 'disabled') {
    return 'idle';
  }

  return status;
}

function mapCompositionValueTypeToNodalValueType(valueType: CompositionValueType): NodalGraphValueType {
  if (
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'string' ||
    valueType === 'vec2' ||
    valueType === 'vec3' ||
    valueType === 'vec4' ||
    valueType === 'object'
  ) {
    return valueType;
  }

  return 'object';
}
