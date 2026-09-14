import {
  applyCompositionPatch,
  applyCompositionPatches,
  createAddConnectionPatch,
  createAddModulePatch,
  createUpdateProjectionMetadataPatch,
  type CompositionPatch,
  type CompositionPatchResult
} from './patches.js';
import {
  validateComposition,
  type Composition,
  type CompositionValidationIssue,
  type CompositionValidationResult
} from '@konitif/composition';
import {
  nodalEdgeToConnection,
  nodalGraphToWorkflow,
  nodalGroupToDomain,
  nodalNodeToModule,
  type NodalGraphWorkflowMetadata
} from './adapters/nodalGraphAdapter.js';
import type {
  NodalGraphDocument,
  NodalGraphEdge,
  NodalGraphGroup,
  NodalGraphNode
} from '../types/model.js';

export type CompositionShadowDiagnosticCode =
  | 'shadow.validation-failed'
  | 'shadow.projection-metadata-missing'
  | 'shadow.projection-metadata-incoherent'
  | 'shadow.module-count-mismatch'
  | 'shadow.connection-count-mismatch'
  | 'shadow.domain-count-mismatch'
  | 'shadow.missing-module'
  | 'shadow.extra-module'
  | 'shadow.missing-port'
  | 'shadow.extra-port'
  | 'shadow.missing-connection'
  | 'shadow.extra-connection'
  | 'shadow.missing-domain'
  | 'shadow.extra-domain'
  | 'shadow.invalid-connection'
  | 'shadow.patch-rejected';

export type CompositionShadowDiagnosticKind =
  | 'validation'
  | 'projection-metadata'
  | 'module'
  | 'port'
  | 'connection'
  | 'domain'
  | 'patch';

export type CompositionShadowDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface CompositionShadowDiagnostic {
  code: CompositionShadowDiagnosticCode;
  kind: CompositionShadowDiagnosticKind;
  message: string;
  severity: CompositionShadowDiagnosticSeverity;
  graphEntityId?: string;
  compositionEntityId?: string;
  patchKind?: CompositionPatch['type'];
  details?: Record<string, unknown>;
  moduleId?: string;
  nodeId?: string;
  portId?: string;
  connectionId?: string;
  edgeId?: string;
  domainId?: string;
  groupId?: string;
  patchType?: CompositionPatch['type'];
  validationIssues?: CompositionValidationIssue[];
}

export interface CompositionShadowDiagnosticsSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  lastAppliedPatch: CompositionPatch['type'] | null;
  lastRejectedPatch: CompositionPatch['type'] | null;
}

export interface CompositionShadowDiagnostics {
  valid: boolean;
  graphIsProjection: true;
  validation: CompositionValidationResult;
  diagnostics: CompositionShadowDiagnostic[];
  invalidConnections: CompositionValidationIssue[];
  summary: CompositionShadowDiagnosticsSummary;
}

export interface CompositionShadowState {
  graph: NodalGraphDocument;
  composition: Composition;
  shadowRevision: number;
  appliedPatches: CompositionPatch[];
  rejectedPatches: CompositionPatch[];
  diagnostics: CompositionShadowDiagnostics;
}

export interface ApplyGraphEditAsCompositionPatchInput {
  previousGraph: NodalGraphDocument;
  nextGraph: NodalGraphDocument;
}

export function createCompositionShadowState(graph: NodalGraphDocument): CompositionShadowState {
  const composition = createShadowCompositionFromGraph(graph);

  return createShadowState({
    graph,
    composition,
    shadowRevision: 0,
    appliedPatches: [],
    rejectedPatches: []
  });
}

export function applyGraphEditAsCompositionPatch(
  state: CompositionShadowState,
  input: ApplyGraphEditAsCompositionPatchInput
): CompositionShadowState {
  const patches = createCompositionPatchesFromGraphEdit(input.previousGraph, input.nextGraph);
  const result = applyCompositionShadowPatches(state.composition, patches);

  return createShadowState({
    graph: input.nextGraph,
    composition: result.composition,
    shadowRevision: state.shadowRevision + result.appliedPatches.length,
    appliedPatches: [...state.appliedPatches, ...result.appliedPatches],
    rejectedPatches: [...state.rejectedPatches, ...result.rejectedPatches],
    rejectedPatchResult: result.rejectedPatchResult
  });
}

export function getCompositionShadowDiagnostics(
  input: CompositionShadowState | { graph: NodalGraphDocument; composition: Composition }
): CompositionShadowDiagnostics {
  const validation = validateComposition(input.composition);
  const diagnostics = [
    ...createValidationDiagnostics(validation),
    ...createDivergenceDiagnostics(input.graph, input.composition),
    ...createInvalidConnectionDiagnostics(validation)
  ];
  const appliedPatches = 'appliedPatches' in input ? input.appliedPatches : [];
  const rejectedPatches = 'rejectedPatches' in input ? input.rejectedPatches : [];

  return {
    valid: validation.valid && diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    graphIsProjection: true,
    validation,
    diagnostics,
    invalidConnections: validation.issues.filter(isConnectionIssue),
    summary: createCompositionShadowDiagnosticsSummary(diagnostics, appliedPatches, rejectedPatches)
  };
}

export function createCompositionPatchesFromGraphEdit(
  previousGraph: NodalGraphDocument,
  nextGraph: NodalGraphDocument
): CompositionPatch[] {
  const previousNodesById = new Map(previousGraph.nodes.map((node) => [node.id, node]));
  const nextNodesById = new Map(nextGraph.nodes.map((node) => [node.id, node]));
  const previousEdgesById = new Map(previousGraph.edges.map((edge) => [edge.id, edge]));
  const nextEdgesById = new Map(nextGraph.edges.map((edge) => [edge.id, edge]));
  const previousGroupsById = new Map(previousGraph.groups.map((group) => [group.id, group]));
  const nextGroupsById = new Map(nextGraph.groups.map((group) => [group.id, group]));
  const removedNodeIds = new Set(previousGraph.nodes.filter((node) => !nextNodesById.has(node.id)).map((node) => node.id));
  let projectionMetadataChanged =
    previousGraph.dialect !== nextGraph.dialect ||
    JSON.stringify(previousGraph.metadata) !== JSON.stringify(nextGraph.metadata);
  const patches: CompositionPatch[] = [];

  for (const node of nextGraph.nodes) {
    const previousNode = previousNodesById.get(node.id);

    if (!previousNode) {
      patches.push(createAddModulePatch(nodalNodeToModule(node)));
      continue;
    }

    if (hasBusinessNodeChange(previousNode, node)) {
      const nextModule = nodalNodeToModule(node);
      patches.push({
        type: 'updateModule',
        moduleId: node.id,
        patch: {
          kind: nextModule.kind,
          title: nextModule.title,
          ports: nextModule.ports,
          runtimeState: nextModule.runtimeState,
          asset: nextModule.asset,
          metadata: nextModule.metadata
        }
      });
    }

    if (hasProjectionNodeChange(previousNode, node)) {
      projectionMetadataChanged = true;
    }
  }

  for (const group of nextGraph.groups) {
    const previousGroup = previousGroupsById.get(group.id);

    if (!previousGroup) {
      patches.push({ type: 'addDomain', domain: nodalGroupToDomain(group) });
      continue;
    }

    if (hasDomainChange(previousGroup, group)) {
      const domain = nodalGroupToDomain(group);
      patches.push({
        type: 'updateDomain',
        domainId: group.id,
        patch: {
          title: domain.title,
          moduleIds: domain.moduleIds
        }
      });
    }

    if (hasProjectionGroupChange(previousGroup, group)) {
      projectionMetadataChanged = true;
    }
  }

  for (const group of previousGraph.groups) {
    if (!nextGroupsById.has(group.id)) {
      projectionMetadataChanged = true;
      patches.push({ type: 'removeDomain', domainId: group.id });
    }
  }

  if (projectionMetadataChanged) {
    patches.push(createUpdateProjectionMetadataPatch(
      { ...readNodalGraphProjectionMetadata(nextGraph) },
      { replace: true }
    ));
  }

  for (const edge of nextGraph.edges) {
    if (!previousEdgesById.has(edge.id)) {
      patches.push(createAddConnectionPatch(nodalEdgeToConnection(edge)));
    }
  }

  for (const edge of previousGraph.edges) {
    if (!nextEdgesById.has(edge.id) && !isEdgeConnectedToRemovedNode(edge, removedNodeIds)) {
      patches.push({ type: 'removeConnection', connectionId: edge.id });
    }
  }

  for (const node of previousGraph.nodes) {
    if (!nextNodesById.has(node.id)) {
      patches.push({ type: 'removeModule', moduleId: node.id, cascadeConnections: true });
    }
  }

  return patches;
}

function createShadowCompositionFromGraph(graph: NodalGraphDocument): Composition {
  const workflow = nodalGraphToWorkflow(graph);

  return {
    ...workflow.composition,
    metadata: {
      ...(workflow.composition.metadata ?? {}),
      projectionMetadata: readNodalGraphProjectionMetadata(graph)
    }
  };
}

function readNodalGraphProjectionMetadata(graph: NodalGraphDocument): NonNullable<NodalGraphWorkflowMetadata['projectionMetadata']> {
  const workflow = nodalGraphToWorkflow(graph);
  const metadata = workflow.metadata as NodalGraphWorkflowMetadata | undefined;
  const projectionMetadata = metadata?.projectionMetadata;

  if (!projectionMetadata) {
    throw new Error(`Missing nodal graph projection metadata for graph "${graph.id}".`);
  }

  return projectionMetadata;
}

function applyCompositionShadowPatches(
  composition: Composition,
  patches: readonly CompositionPatch[]
): {
  composition: Composition;
  appliedPatches: CompositionPatch[];
  rejectedPatches: CompositionPatch[];
  rejectedPatchResult: CompositionPatchResult | null;
} {
  if (patches.length === 0) {
    return {
      composition,
      appliedPatches: [],
      rejectedPatches: [],
      rejectedPatchResult: null
    };
  }

  const result = applyCompositionPatches(composition, patches);

  if (result.applied) {
    return {
      composition: result.composition,
      appliedPatches: [...patches],
      rejectedPatches: [],
      rejectedPatchResult: null
    };
  }

  const appliedPatches: CompositionPatch[] = [];
  let currentComposition = composition;

  for (const patch of patches) {
    const patchResult = applyCompositionPatch(currentComposition, patch);

    if (!patchResult.applied) {
      return {
        composition: currentComposition,
        appliedPatches,
        rejectedPatches: [patch, ...patches.slice(appliedPatches.length + 1)],
        rejectedPatchResult: patchResult
      };
    }

    currentComposition = patchResult.composition;
    appliedPatches.push(patch);
  }

  return {
    composition: currentComposition,
    appliedPatches,
    rejectedPatches: [],
    rejectedPatchResult: null
  };
}

function createShadowState(input: {
  graph: NodalGraphDocument;
  composition: Composition;
  shadowRevision: number;
  appliedPatches: CompositionPatch[];
  rejectedPatches: CompositionPatch[];
  rejectedPatchResult?: CompositionPatchResult | null;
}): CompositionShadowState {
  const baseDiagnostics = getCompositionShadowDiagnostics({
    graph: input.graph,
    composition: input.composition
  });
  const rejectionDiagnostics = input.rejectedPatchResult
    ? createRejectedPatchDiagnostics(input.rejectedPatchResult)
    : [];
  const diagnostics = {
    ...baseDiagnostics,
    diagnostics: [...baseDiagnostics.diagnostics, ...rejectionDiagnostics],
    summary: createCompositionShadowDiagnosticsSummary(
      [...baseDiagnostics.diagnostics, ...rejectionDiagnostics],
      input.appliedPatches,
      input.rejectedPatches
    )
  };

  return {
    graph: structuredClone(input.graph),
    composition: structuredClone(input.composition),
    shadowRevision: input.shadowRevision,
    appliedPatches: [...input.appliedPatches],
    rejectedPatches: [...input.rejectedPatches],
    diagnostics: {
      ...diagnostics,
      valid: diagnostics.valid && rejectionDiagnostics.length === 0
    }
  };
}

function createValidationDiagnostics(validation: CompositionValidationResult): CompositionShadowDiagnostic[] {
  if (validation.valid) {
    return [];
  }

  return [
    {
      code: 'shadow.validation-failed',
      kind: 'validation',
      severity: 'warning',
      message: 'Shadow Composition validation reported issues.',
      validationIssues: validation.issues,
      details: {
        issueCount: validation.issues.length
      }
    }
  ];
}

function createInvalidConnectionDiagnostics(validation: CompositionValidationResult): CompositionShadowDiagnostic[] {
  return validation.issues
    .filter(isConnectionIssue)
    .map((issue) => ({
      code: 'shadow.invalid-connection',
      kind: 'connection',
      severity: issue.severity === 'error' ? 'error' : 'warning',
      message: issue.connectionId
        ? `Shadow Composition connection "${issue.connectionId}" is invalid: ${issue.message}`
        : `Shadow Composition connection validation issue: ${issue.message}`,
      graphEntityId: issue.connectionId,
      compositionEntityId: issue.connectionId,
      connectionId: issue.connectionId,
      edgeId: issue.connectionId,
      moduleId: issue.moduleId,
      portId: issue.portId,
      validationIssues: [issue],
      details: {
        validationCode: issue.code
      }
    } satisfies CompositionShadowDiagnostic));
}

function createRejectedPatchDiagnostics(result: CompositionPatchResult): CompositionShadowDiagnostic[] {
  return result.patch
    ? [
        {
          code: 'shadow.patch-rejected',
          kind: 'patch',
          severity: 'warning',
          message: `Composition shadow patch "${result.patch.type}" was rejected without blocking the graph edit.`,
          patchKind: result.patch.type,
          patchType: result.patch.type,
          validationIssues: result.validation.issues,
          details: {
            validationIssueCount: result.validation.issues.length
          }
        }
      ]
    : [];
}

function createCompositionShadowDiagnosticsSummary(
  diagnostics: readonly CompositionShadowDiagnostic[],
  appliedPatches: readonly CompositionPatch[],
  rejectedPatches: readonly CompositionPatch[]
): CompositionShadowDiagnosticsSummary {
  return {
    total: diagnostics.length,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
    infos: diagnostics.filter((diagnostic) => diagnostic.severity === 'info').length,
    lastAppliedPatch: appliedPatches.length > 0 ? appliedPatches[appliedPatches.length - 1]?.type ?? null : null,
    lastRejectedPatch: rejectedPatches.length > 0 ? rejectedPatches[rejectedPatches.length - 1]?.type ?? null : null
  };
}

function createDivergenceDiagnostics(
  graph: NodalGraphDocument,
  composition: Composition
): CompositionShadowDiagnostic[] {
  const diagnostics: CompositionShadowDiagnostic[] = [];
  const graphNodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const compositionModulesById = new Map(composition.modules.map((module) => [module.id, module]));
  const graphEdgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const compositionConnectionsById = new Map(composition.connections.map((connection) => [connection.id, connection]));
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const compositionModuleIds = new Set(composition.modules.map((module) => module.id));
  const graphEdgeIds = new Set(graph.edges.map((edge) => edge.id));
  const compositionConnectionIds = new Set(composition.connections.map((connection) => connection.id));
  const graphGroupIds = new Set(graph.groups.map((group) => group.id));
  const compositionDomainIds = new Set(composition.domains.map((domain) => domain.id));
  const projectionMetadata = readShadowProjectionMetadata(composition);
  const projectionNodeMetadata = readRecord(projectionMetadata?.nodes);
  const projectionGroupMetadata = readRecord(projectionMetadata?.groups);

  if (!projectionMetadata) {
    diagnostics.push({
      code: 'shadow.projection-metadata-missing',
      kind: 'projection-metadata',
      severity: 'warning',
      message: 'Shadow Composition is missing nodal graph projection metadata.',
      details: {
        graphId: graph.id
      }
    });
  } else {
    if (
      projectionMetadata.kind !== 'nodal-graph' ||
      projectionMetadata.graphId !== graph.id ||
      projectionMetadata.dialect !== graph.dialect
    ) {
      diagnostics.push({
        code: 'shadow.projection-metadata-incoherent',
        kind: 'projection-metadata',
        severity: 'warning',
        message: 'Shadow Composition projection metadata does not match the current graph identity.',
        graphEntityId: graph.id,
        compositionEntityId: typeof projectionMetadata.graphId === 'string' ? projectionMetadata.graphId : undefined,
        details: {
          graphId: graph.id,
          projectionGraphId: projectionMetadata.graphId,
          graphDialect: graph.dialect,
          projectionDialect: projectionMetadata.dialect,
          projectionKind: projectionMetadata.kind
        }
      });
    }

    for (const nodeId of graphNodeIds) {
      if (!projectionNodeMetadata || !(nodeId in projectionNodeMetadata)) {
        diagnostics.push({
          code: 'shadow.projection-metadata-incoherent',
          kind: 'projection-metadata',
          severity: 'info',
          message: `Projection metadata is missing graph node "${nodeId}".`,
          graphEntityId: nodeId,
          compositionEntityId: nodeId,
          nodeId,
          moduleId: nodeId
        });
      }
    }

    for (const groupId of graphGroupIds) {
      if (!projectionGroupMetadata || !(groupId in projectionGroupMetadata)) {
        diagnostics.push({
          code: 'shadow.projection-metadata-incoherent',
          kind: 'projection-metadata',
          severity: 'info',
          message: `Projection metadata is missing graph group "${groupId}".`,
          graphEntityId: groupId,
          compositionEntityId: groupId,
          groupId,
          domainId: groupId
        });
      }
    }
  }

  if (graph.nodes.length !== composition.modules.length) {
    diagnostics.push({
      code: 'shadow.module-count-mismatch',
      kind: 'module',
      severity: 'warning',
      message: `Graph has ${graph.nodes.length} nodes while shadow Composition has ${composition.modules.length} modules.`,
      details: {
        graphNodes: graph.nodes.length,
        compositionModules: composition.modules.length
      }
    });
  }

  if (graph.edges.length !== composition.connections.length) {
    diagnostics.push({
      code: 'shadow.connection-count-mismatch',
      kind: 'connection',
      severity: 'warning',
      message: `Graph has ${graph.edges.length} edges while shadow Composition has ${composition.connections.length} connections.`,
      details: {
        graphEdges: graph.edges.length,
        compositionConnections: composition.connections.length
      }
    });
  }

  if (graph.groups.length !== composition.domains.length) {
    diagnostics.push({
      code: 'shadow.domain-count-mismatch',
      kind: 'domain',
      severity: 'warning',
      message: `Graph has ${graph.groups.length} groups while shadow Composition has ${composition.domains.length} domains.`,
      details: {
        graphGroups: graph.groups.length,
        compositionDomains: composition.domains.length
      }
    });
  }

  for (const nodeId of graphNodeIds) {
    if (!compositionModuleIds.has(nodeId)) {
      diagnostics.push({
        code: 'shadow.missing-module',
        kind: 'module',
        severity: 'warning',
        message: `Graph node "${nodeId}" is missing from shadow Composition modules.`,
        graphEntityId: nodeId,
        compositionEntityId: nodeId,
        nodeId,
        moduleId: nodeId
      });
    }
  }

  for (const moduleId of compositionModuleIds) {
    if (!graphNodeIds.has(moduleId)) {
      diagnostics.push({
        code: 'shadow.extra-module',
        kind: 'module',
        severity: 'warning',
        message: `Shadow Composition module "${moduleId}" is not present in the graph.`,
        graphEntityId: moduleId,
        compositionEntityId: moduleId,
        nodeId: moduleId,
        moduleId
      });
    }
  }

  for (const [nodeId, node] of graphNodesById) {
    const module = compositionModulesById.get(nodeId);

    if (!module) {
      continue;
    }

    const graphPorts = [...node.inputs, ...node.outputs];
    const compositionPortsById = new Map(module.ports.map((port) => [port.id, port]));

    for (const port of graphPorts) {
      if (!compositionPortsById.has(port.id)) {
        diagnostics.push({
          code: 'shadow.missing-port',
          kind: 'port',
          severity: 'warning',
          message: `Graph port "${nodeId}.${port.id}" is missing from shadow Composition module ports.`,
          graphEntityId: `${nodeId}.${port.id}`,
          compositionEntityId: `${nodeId}.${port.id}`,
          nodeId,
          moduleId: nodeId,
          portId: port.id
        });
      }
    }

    const graphPortIds = new Set(graphPorts.map((port) => port.id));

    for (const port of module.ports) {
      if (!graphPortIds.has(port.id)) {
        diagnostics.push({
          code: 'shadow.extra-port',
          kind: 'port',
          severity: 'warning',
          message: `Shadow Composition port "${nodeId}.${port.id}" is not present in the graph node ports.`,
          graphEntityId: `${nodeId}.${port.id}`,
          compositionEntityId: `${nodeId}.${port.id}`,
          nodeId,
          moduleId: nodeId,
          portId: port.id
        });
      }
    }
  }

  for (const edgeId of graphEdgeIds) {
    if (!compositionConnectionIds.has(edgeId)) {
      diagnostics.push({
        code: 'shadow.missing-connection',
        kind: 'connection',
        severity: 'warning',
        message: `Graph edge "${edgeId}" is missing from shadow Composition connections.`,
        graphEntityId: edgeId,
        compositionEntityId: edgeId,
        edgeId,
        connectionId: edgeId
      });
      continue;
    }

    const graphEdge = graphEdgesById.get(edgeId);
    const compositionConnection = compositionConnectionsById.get(edgeId);

    if (
      graphEdge &&
      compositionConnection &&
      (
        graphEdge.sourceNodeId !== compositionConnection.source.moduleId ||
        graphEdge.sourcePortId !== compositionConnection.source.portId ||
        graphEdge.targetNodeId !== compositionConnection.target.moduleId ||
        graphEdge.targetPortId !== compositionConnection.target.portId
      )
    ) {
      diagnostics.push({
        code: 'shadow.projection-metadata-incoherent',
        kind: 'connection',
        severity: 'warning',
        message: `Graph edge "${edgeId}" and shadow Composition connection "${edgeId}" do not share the same endpoints.`,
        graphEntityId: edgeId,
        compositionEntityId: edgeId,
        edgeId,
        connectionId: edgeId,
        details: {
          graphSource: `${graphEdge.sourceNodeId}.${graphEdge.sourcePortId}`,
          graphTarget: `${graphEdge.targetNodeId}.${graphEdge.targetPortId}`,
          compositionSource: `${compositionConnection.source.moduleId}.${compositionConnection.source.portId}`,
          compositionTarget: `${compositionConnection.target.moduleId}.${compositionConnection.target.portId}`
        }
      });
    }
  }

  for (const connectionId of compositionConnectionIds) {
    if (!graphEdgeIds.has(connectionId)) {
      diagnostics.push({
        code: 'shadow.extra-connection',
        kind: 'connection',
        severity: 'warning',
        message: `Shadow Composition connection "${connectionId}" is not present in the graph.`,
        graphEntityId: connectionId,
        compositionEntityId: connectionId,
        edgeId: connectionId,
        connectionId
      });
    }
  }

  for (const groupId of graphGroupIds) {
    if (!compositionDomainIds.has(groupId)) {
      diagnostics.push({
        code: 'shadow.missing-domain',
        kind: 'domain',
        severity: 'warning',
        message: `Graph group "${groupId}" is missing from shadow Composition domains.`,
        graphEntityId: groupId,
        compositionEntityId: groupId,
        groupId,
        domainId: groupId
      });
    }
  }

  for (const domainId of compositionDomainIds) {
    if (!graphGroupIds.has(domainId)) {
      diagnostics.push({
        code: 'shadow.extra-domain',
        kind: 'domain',
        severity: 'warning',
        message: `Shadow Composition domain "${domainId}" is not present in the graph.`,
        graphEntityId: domainId,
        compositionEntityId: domainId,
        groupId: domainId,
        domainId
      });
    }
  }

  return diagnostics;
}

function hasBusinessNodeChange(previousNode: NodalGraphNode, nextNode: NodalGraphNode): boolean {
  return (
    previousNode.type !== nextNode.type ||
    previousNode.title !== nextNode.title ||
    JSON.stringify(previousNode.inputs) !== JSON.stringify(nextNode.inputs) ||
    JSON.stringify(previousNode.outputs) !== JSON.stringify(nextNode.outputs) ||
    JSON.stringify(previousNode.config) !== JSON.stringify(nextNode.config) ||
    JSON.stringify(previousNode.state ?? null) !== JSON.stringify(nextNode.state ?? null)
  );
}

function hasProjectionNodeChange(previousNode: NodalGraphNode, nextNode: NodalGraphNode): boolean {
  return (
    previousNode.position.x !== nextNode.position.x ||
    previousNode.position.y !== nextNode.position.y ||
    previousNode.mode !== nextNode.mode ||
    previousNode.locked !== nextNode.locked ||
    JSON.stringify(previousNode.source ?? null) !== JSON.stringify(nextNode.source ?? null) ||
    JSON.stringify(previousNode.badges ?? []) !== JSON.stringify(nextNode.badges ?? []) ||
    JSON.stringify(previousNode.appearance ?? { color: null }) !== JSON.stringify(nextNode.appearance ?? { color: null }) ||
    (previousNode.missingDefinition ?? false) !== (nextNode.missingDefinition ?? false)
  );
}

function hasDomainChange(previousGroup: NodalGraphGroup, nextGroup: NodalGraphGroup): boolean {
  return (
    previousGroup.label !== nextGroup.label ||
    JSON.stringify(previousGroup.nodeIds) !== JSON.stringify(nextGroup.nodeIds)
  );
}

function hasProjectionGroupChange(previousGroup: NodalGraphGroup, nextGroup: NodalGraphGroup): boolean {
  return previousGroup.color !== nextGroup.color;
}

function isEdgeConnectedToRemovedNode(edge: NodalGraphEdge, removedNodeIds: ReadonlySet<string>): boolean {
  return removedNodeIds.has(edge.sourceNodeId) || removedNodeIds.has(edge.targetNodeId);
}

function readShadowProjectionMetadata(composition: Composition): Record<string, unknown> | null {
  const metadata = composition.metadata?.projectionMetadata;

  return readRecord(metadata);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isConnectionIssue(issue: CompositionValidationIssue): boolean {
  return (
    typeof issue.connectionId === 'string' ||
    issue.code.startsWith('connection.') ||
    issue.code.startsWith('port.')
  );
}
