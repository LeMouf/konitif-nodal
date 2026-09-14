import type { NodalExecutionResult, NodalGraphDocument, NodalGraphNode } from '../types/model.js';

export type NodalNodeFamily = 'source' | 'compute' | 'output';

export function isNodalInlineConfigNode(node: NodalGraphNode): boolean {
  return node.inputs.length === 0 && Object.keys(node.config).length === 1 && Object.prototype.hasOwnProperty.call(node.config, 'value');
}

export function getNodalNodeFamily(node: NodalGraphNode): NodalNodeFamily {
  if (node.type === 'graph:output') {
    return 'output';
  }

  if (node.inputs.length === 0 && node.outputs.length > 0) {
    return 'source';
  }

  return 'compute';
}

export function getNodalGraphOutputNode(graph: NodalGraphDocument): NodalGraphNode | null {
  return graph.nodes.find((node) => node.type === 'graph:output') ?? null;
}

function resolveNodalLifecycleOutput(result: NodalExecutionResult): unknown {
  for (const nodeId of [...result.executionOrder].reverse()) {
    const outputs = result.outputsByNodeId[nodeId];

    if (!outputs) {
      continue;
    }

    if (outputs.onFinish != null) {
      return outputs.onFinish;
    }

    if (outputs.onSuccess != null) {
      return outputs.onSuccess;
    }

    if (outputs.onFailure != null) {
      return outputs.onFailure;
    }

    if (outputs.success != null) {
      return outputs.success;
    }

    if (outputs.failure != null) {
      return outputs.failure;
    }
  }

  return null;
}

export function resolveNodalExecutionPrimaryOutputValue(result: NodalExecutionResult | null): unknown {
  if (!result) {
    return null;
  }

  const outputNode = getNodalGraphOutputNode(result.graph);

  return (
    (outputNode ? result.outputsByNodeId[outputNode.id]?.value : null) ??
    outputNode?.state?.outputs?.value ??
    resolveNodalLifecycleOutput(result) ??
    null
  );
}
