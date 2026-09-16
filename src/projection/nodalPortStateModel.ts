import type { NodalGraphDocument, NodalGraphEdge, NodalGraphNode, NodalGraphPort } from '../types/model.js';
import type { NodalConnectionDraftPortRef } from './nodalConnectionInteractionModel.js';
import { isPortCompatibleWithDraft } from './nodalInteractionModel.js';

export type NodalPortVisualState = 'connected' | 'available' | 'candidate' | 'blocked' | 'detached';
export type NodalPortActivityState = 'on' | 'off' | 'disabled';
export type NodalPortConnectionState = 'connected' | 'connectable' | 'candidate' | 'blocked' | 'detached';
export type NodalPortRuntimeState = 'idle' | 'running' | 'success' | 'error' | 'missing' | 'locked';
export type NodalPortTone = 'accent' | 'danger' | 'disabled' | 'neutral' | 'success' | 'warning';

export type NodalResolvedPortState = {
  runtimeState: NodalPortRuntimeState;
  runtimeLabel: string | null;
  visualState: NodalPortVisualState;
  activityState: NodalPortActivityState;
  connectionState: NodalPortConnectionState;
  tone: NodalPortTone;
  visualLabel: string;
  metaLabel: string;
  a11yLabel: string;
};

export function getNodalPortIdentityKey(nodeId: string, portId: string): string {
  return `${nodeId}:${portId}`;
}

export function findNodalIncomingEdgeForPort(
  graph: Pick<NodalGraphDocument, 'edges'>,
  nodeId: string,
  portId: string
): NodalGraphEdge | null {
  return graph.edges.find((edge) => edge.targetNodeId === nodeId && edge.targetPortId === portId) ?? null;
}

export function findNodalOutgoingEdgeForPort(
  graph: Pick<NodalGraphDocument, 'edges'>,
  nodeId: string,
  portId: string
): NodalGraphEdge | null {
  return graph.edges.find((edge) => edge.sourceNodeId === nodeId && edge.sourcePortId === portId) ?? null;
}

export function hasNodalPortConnection(
  graph: Pick<NodalGraphDocument, 'edges'>,
  port: Pick<NodalGraphPort, 'nodeId' | 'id' | 'direction'>
): boolean {
  return port.direction === 'input'
    ? Boolean(findNodalIncomingEdgeForPort(graph, port.nodeId, port.id))
    : Boolean(findNodalOutgoingEdgeForPort(graph, port.nodeId, port.id));
}

export function resolveNodalPortRuntimeState(
  node: Pick<NodalGraphNode, 'locked' | 'missingDefinition' | 'state'>
): NodalPortRuntimeState {
  if (node.locked) {
    return 'locked';
  }

  if (node.missingDefinition || node.state?.status === 'missing') {
    return 'missing';
  }

  return node.state?.status ?? 'idle';
}

export function resolveNodalPortRuntimeStateLabel(runtimeState: NodalPortRuntimeState): string | null {
  return runtimeState === 'idle' ? null : runtimeState;
}

export function resolveNodalPortVisualState(input: {
  node: Pick<NodalGraphNode, 'locked' | 'missingDefinition' | 'state'>;
  port: Pick<NodalGraphPort, 'nodeId' | 'id' | 'direction' | 'dataType' | 'mode'>;
  connectionDraft: NodalConnectionDraftPortRef | null;
  connectionDraftPort: Pick<NodalGraphPort, 'direction' | 'dataType' | 'mode'> | null;
  draftCandidatePortKey: string | null;
  portKey: string;
  detachedOriginPort: boolean;
  hasIncomingEdge: boolean;
  hasOutgoingEdge: boolean;
  hasPortConnection: boolean;
}): NodalPortVisualState {
  if (
    (input.connectionDraft?.nodeId === input.port.nodeId &&
      input.connectionDraft?.portId === input.port.id &&
      input.connectionDraft?.direction === input.port.direction) ||
    input.detachedOriginPort
  ) {
    return 'detached';
  }

  if (input.draftCandidatePortKey === input.portKey) {
    return 'candidate';
  }

  if (input.node.locked) {
    return 'blocked';
  }

  if (input.connectionDraft && input.port.direction !== input.connectionDraft.direction) {
    if (!isPortCompatibleWithDraft(input.connectionDraft, input.connectionDraftPort, input.port)) {
      return 'blocked';
    }

    if (input.port.direction === 'input' && input.hasIncomingEdge && !input.detachedOriginPort) {
      return 'blocked';
    }

    if (input.port.direction === 'output' && input.hasOutgoingEdge && !input.detachedOriginPort) {
      return 'blocked';
    }
  }

  if (input.hasPortConnection) {
    return 'connected';
  }

  return 'available';
}

export function resolveNodalPortVisualStateLabel(visualState: NodalPortVisualState): string {
  if (visualState === 'connected') {
    return 'Connected';
  }

  if (visualState === 'candidate') {
    return 'Compatible';
  }

  if (visualState === 'blocked') {
    return 'Blocked';
  }

  if (visualState === 'detached') {
    return 'Rewiring';
  }

  return 'Available';
}

export function resolveNodalPortConnectionState(input: {
  visualState: NodalPortVisualState;
  hasPortConnection: boolean;
}): NodalPortConnectionState {
  if (input.hasPortConnection || input.visualState === 'connected') {
    return 'connected';
  }

  if (input.visualState === 'candidate') {
    return 'candidate';
  }

  if (input.visualState === 'blocked') {
    return 'blocked';
  }

  if (input.visualState === 'detached') {
    return 'detached';
  }

  return 'connectable';
}

export function resolveNodalPortActivityState(input: {
  connectionState: NodalPortConnectionState;
  runtimeState?: NodalPortRuntimeState;
}): NodalPortActivityState {
  if (input.connectionState === 'blocked') {
    return 'disabled';
  }

  if (input.runtimeState === 'running') {
    return 'on';
  }

  return 'off';
}

export function resolveNodalPortTone(input: {
  activityState: NodalPortActivityState;
  runtimeState: NodalPortRuntimeState;
}): NodalPortTone {
  if (input.runtimeState === 'error') {
    return 'danger';
  }

  if (input.runtimeState === 'missing') {
    return 'warning';
  }

  if (input.runtimeState === 'locked') {
    return 'disabled';
  }

  if (input.runtimeState === 'success') {
    return 'success';
  }

  if (input.runtimeState === 'running' || input.activityState === 'on') {
    return 'accent';
  }

  if (input.activityState === 'disabled') {
    return 'disabled';
  }

  return 'neutral';
}

export function resolveNodalPortState(input: {
  node: Pick<NodalGraphNode, 'locked' | 'missingDefinition' | 'state'>;
  port: Pick<NodalGraphPort, 'nodeId' | 'id' | 'direction' | 'dataType' | 'mode'>;
  connectionDraft: NodalConnectionDraftPortRef | null;
  connectionDraftPort: Pick<NodalGraphPort, 'direction' | 'dataType' | 'mode'> | null;
  draftCandidatePortKey: string | null;
  portKey: string;
  detachedOriginPort: boolean;
  hasIncomingEdge: boolean;
  hasOutgoingEdge: boolean;
  hasPortConnection: boolean;
  semanticLabel: string;
  accessibilityLabel: string;
}): NodalResolvedPortState {
  const runtimeState = resolveNodalPortRuntimeState(input.node);
  const runtimeLabel = resolveNodalPortRuntimeStateLabel(runtimeState);
  const visualState = resolveNodalPortVisualState(input);
  const connectionState = resolveNodalPortConnectionState({
    visualState,
    hasPortConnection: input.hasPortConnection
  });
  const activityState = resolveNodalPortActivityState({
    connectionState,
    runtimeState
  });
  const tone = resolveNodalPortTone({ activityState, runtimeState });
  const visualLabel = resolveNodalPortVisualStateLabel(visualState);
  const metaParts = [visualLabel, input.semanticLabel, input.port.dataType];

  if (runtimeLabel) {
    metaParts.push(runtimeLabel);
  }

  return {
    runtimeState,
    runtimeLabel,
    visualState,
    activityState,
    connectionState,
    tone,
    visualLabel,
    metaLabel: metaParts.join(' • '),
    a11yLabel: `${input.accessibilityLabel}, ${visualLabel}${runtimeLabel ? `, ${runtimeLabel}` : ''}`
  };
}
