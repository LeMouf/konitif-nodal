import { cloneGraphDocument } from '../core/graph.js';
import { validateGraphDocument } from '../core/validation.js';
import type { NodalExecutionResult, NodalGraphDocument, NodalGraphNode } from '../types/model.js';
import type { NodalDialect } from '../types/registry.js';

function buildExecutionOrder(graph: NodalGraphDocument): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const queue = [...graph.nodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0).map((node) => node.id)];
  const ordered: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId) {
      break;
    }

    ordered.push(nodeId);

    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      const nextInDegree = (inDegree.get(nextNodeId) ?? 0) - 1;
      inDegree.set(nextNodeId, nextInDegree);

      if (nextInDegree === 0) {
        queue.push(nextNodeId);
      }
    }
  }

  return ordered.length === graph.nodes.length ? ordered : graph.nodes.map((node) => node.id);
}

function normalizePortKey(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '').toLowerCase();
}

function buildBypassOutputs(node: NodalGraphNode, resolvedInputs: Record<string, unknown>): Record<string, unknown> {
  const inputsById = new Map(node.inputs.map((input) => [input.id, resolvedInputs[input.id]]));
  const inputsByLabel = new Map(node.inputs.map((input) => [normalizePortKey(input.label), resolvedInputs[input.id]]));
  const firstInputValue = node.inputs.length > 0 ? resolvedInputs[node.inputs[0]?.id ?? ''] : undefined;

  return Object.fromEntries(
    node.outputs.map((output, index) => {
      const outputKey = normalizePortKey(output.label);
      const directValue = inputsById.get(output.id);
      const labelValue = inputsByLabel.get(outputKey);
      const sameTypeInput = node.inputs.find((input) => input.dataType === output.dataType);
      const sameTypeValue = sameTypeInput ? resolvedInputs[sameTypeInput.id] : undefined;

      return [
        output.id,
        directValue ?? labelValue ?? sameTypeValue ?? firstInputValue ?? resolvedInputs[node.inputs[index]?.id ?? '']
      ];
    })
  );
}

export function executeGraphDocument(graph: NodalGraphDocument, dialect: NodalDialect): NodalExecutionResult {
  const validation = validateGraphDocument(graph, dialect);
  const nextGraph = cloneGraphDocument(graph);
  const outputsByNodeId: Record<string, Record<string, unknown>> = {};

  if (!validation.valid) {
    return {
      graph: nextGraph,
      outputsByNodeId,
      executionOrder: [],
      validation
    };
  }

  const executionOrder = buildExecutionOrder(nextGraph);

  for (const nodeId of executionOrder) {
    const node = nextGraph.nodes.find((candidate) => candidate.id === nodeId);

    if (!node) {
      continue;
    }

    const definition = dialect.nodeRegistry.find((candidate) => candidate.type === node.type) ?? null;

    if (node.missingDefinition || !definition) {
      node.state = {
        status: 'missing',
        message: 'Node definition is missing.',
        outputs: {}
      };
      outputsByNodeId[node.id] = {};
      continue;
    }

    if (node.mode === 'never') {
      node.state = {
        status: 'idle',
        message: 'Node execution disabled.',
        outputs: {}
      };
      outputsByNodeId[node.id] = {};
      continue;
    }

    const resolvedInputs: Record<string, unknown> = {};

    for (const input of node.inputs) {
      const incomingEdge = nextGraph.edges.find(
        (edge) => edge.targetNodeId === node.id && edge.targetPortId === input.id
      );

      if (!incomingEdge) {
        continue;
      }

      resolvedInputs[input.id] = outputsByNodeId[incomingEdge.sourceNodeId]?.[incomingEdge.sourcePortId];
    }

    if (node.mode === 'bypass') {
      const bypassOutputs = buildBypassOutputs(node, resolvedInputs);
      outputsByNodeId[node.id] = bypassOutputs;
      node.state = {
        status: 'success',
        message: 'Bypass mode.',
        outputs: bypassOutputs
      };
      continue;
    }

    if (!definition.execute) {
      node.state = {
        status: 'success',
        message: 'No runtime bound for this node.',
        outputs: {}
      };
      outputsByNodeId[node.id] = {};
      continue;
    }

    try {
      node.state = {
        status: 'running',
        message: null,
        outputs: {}
      };

      const result = definition.execute({
        node,
        resolvedInputs,
        graph: nextGraph
      });

      outputsByNodeId[node.id] = result.outputs;
      node.state = {
        status: 'success',
        message: result.message ?? null,
        outputs: result.outputs
      };
    } catch (error) {
      node.state = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Execution failed.',
        outputs: {}
      };
      outputsByNodeId[node.id] = {};
    }
  }

  return {
    graph: nextGraph,
    outputsByNodeId,
    executionOrder,
    validation
  };
}
