import type { NodalGraphDocument, NodalGraphEdge, NodalValidationIssue, NodalValidationResult } from '../types/model.js';
import type { NodalDialect } from '../types/registry.js';

function createIssue(input: Omit<NodalValidationIssue, 'id'> & { id?: string }): NodalValidationIssue {
  return {
    id: input.id ?? `${input.code}:${input.edgeId ?? input.nodeId ?? input.message}`,
    ...input
  };
}

function findNode(graph: NodalGraphDocument, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}

function validateEdge(graph: NodalGraphDocument, edge: NodalGraphEdge): NodalValidationIssue[] {
  const sourceNode = findNode(graph, edge.sourceNodeId);
  const targetNode = findNode(graph, edge.targetNodeId);

  if (!sourceNode || !targetNode) {
    return [
      createIssue({
        severity: 'error',
        code: 'edge.missing-node',
        message: 'Connection references a missing node.',
        edgeId: edge.id
      })
    ];
  }

  const sourcePort = sourceNode.outputs.find((port) => port.id === edge.sourcePortId) ?? null;
  const targetPort = targetNode.inputs.find((port) => port.id === edge.targetPortId) ?? null;

  if (!sourcePort || !targetPort) {
    return [
      createIssue({
        severity: 'error',
        code: 'edge.missing-port',
        message: 'Connection references a missing port.',
        edgeId: edge.id
      })
    ];
  }

  if (sourceNode.id === targetNode.id) {
    return [
      createIssue({
        severity: 'error',
        code: 'edge.self-loop',
        message: 'A node cannot connect to itself in MVP mode.',
        edgeId: edge.id
      })
    ];
  }

  if (sourcePort.direction !== 'output' || targetPort.direction !== 'input') {
    return [
      createIssue({
        severity: 'error',
        code: 'edge.direction',
        message: 'Connections must go from an output port to an input port.',
        edgeId: edge.id
      })
    ];
  }

  if (sourcePort.mode !== targetPort.mode) {
    return [
      createIssue({
        severity: 'error',
        code: 'edge.mode-mismatch',
        message: `Port modes are incompatible: ${sourcePort.mode} -> ${targetPort.mode}.`,
        edgeId: edge.id
      })
    ];
  }

  const targetAcceptsAnyValue = targetNode.type === 'graph:output' && targetPort.id === 'value';

  if (!targetAcceptsAnyValue && sourcePort.dataType !== targetPort.dataType) {
    return [
      createIssue({
        severity: 'error',
        code: 'edge.type-mismatch',
        message: `Port types are incompatible: ${sourcePort.dataType} -> ${targetPort.dataType}.`,
        edgeId: edge.id
      })
    ];
  }

  const competingEdges = graph.edges.filter(
    (candidate) =>
      candidate.id !== edge.id &&
      candidate.targetNodeId === edge.targetNodeId &&
      candidate.targetPortId === edge.targetPortId
  );

  if (competingEdges.length > 0) {
    return [
      createIssue({
        severity: 'error',
        code: 'edge.input-occupied',
        message: 'Each input port accepts a single incoming connection in MVP mode.',
        edgeId: edge.id
      })
    ];
  }

  return [];
}

export function validateGraphDocument(graph: NodalGraphDocument, dialect?: NodalDialect | null): NodalValidationResult {
  const issues: NodalValidationIssue[] = [];

  for (const edge of graph.edges) {
    issues.push(...validateEdge(graph, edge));
  }

  if (dialect?.validate) {
    issues.push(...dialect.validate(graph).issues);
  }

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues
  };
}
