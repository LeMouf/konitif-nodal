import type { NodalGraphEdge, NodalGraphPort } from '../types/model.js';

export type NodalConnectionDraftPortRef = {
  nodeId: string;
  portId: string;
  direction: 'input' | 'output';
};

export type NodalSuspendedInputEdgeRef = {
  edgeId: string;
  input: {
    nodeId: string;
    portId: string;
  };
};

export type NodalIdleConnectionInteraction = {
  phase: 'idle';
};

export type NodalFreshConnectionInteraction = {
  phase: 'draft';
  kind: 'fresh';
  draft: NodalConnectionDraftPortRef;
  pointerId: number | null;
  dropOutsidePolicy: 'cancel';
  suspendedEdge: null;
};

export type NodalRerouteInputConnectionInteraction = {
  phase: 'draft';
  kind: 'reroute-input';
  draft: NodalConnectionDraftPortRef;
  pointerId: number | null;
  dropOutsidePolicy: 'delete';
  suspendedEdge: NodalSuspendedInputEdgeRef;
};

export type NodalSuggestingConnectionInteraction = {
  phase: 'suggesting';
  kind: 'fresh';
  draft: NodalConnectionDraftPortRef;
  pointerId: number | null;
  dropOutsidePolicy: 'cancel';
  suspendedEdge: null;
};

export type NodalConnectionInteraction =
  | NodalIdleConnectionInteraction
  | NodalFreshConnectionInteraction
  | NodalRerouteInputConnectionInteraction
  | NodalSuggestingConnectionInteraction;

export function createIdleConnectionInteraction(): NodalIdleConnectionInteraction {
  return { phase: 'idle' };
}

export function createFreshConnectionInteraction(
  port: Pick<NodalGraphPort, 'nodeId' | 'id' | 'direction'>,
  pointerId: number | null = null
): NodalFreshConnectionInteraction {
  return {
    phase: 'draft',
    kind: 'fresh',
    draft: {
      nodeId: port.nodeId,
      portId: port.id,
      direction: port.direction
    },
    pointerId,
    dropOutsidePolicy: 'cancel',
    suspendedEdge: null
  };
}

export function createInputRerouteInteraction(
  edge: Pick<NodalGraphEdge, 'id' | 'sourceNodeId' | 'sourcePortId' | 'targetNodeId' | 'targetPortId'>,
  pointerId: number | null = null
): NodalRerouteInputConnectionInteraction {
  return {
    phase: 'draft',
    kind: 'reroute-input',
    draft: {
      nodeId: edge.sourceNodeId,
      portId: edge.sourcePortId,
      direction: 'output'
    },
    pointerId,
    dropOutsidePolicy: 'delete',
    suspendedEdge: {
      edgeId: edge.id,
      input: {
        nodeId: edge.targetNodeId,
        portId: edge.targetPortId
      }
    }
  };
}

export function showConnectionSuggestionMenu(
  interaction: NodalFreshConnectionInteraction
): NodalSuggestingConnectionInteraction {
  return {
    phase: 'suggesting',
    kind: 'fresh',
    draft: interaction.draft,
    pointerId: interaction.pointerId,
    dropOutsidePolicy: 'cancel',
    suspendedEdge: null
  };
}

export function getConnectionDraft(
  interaction: NodalConnectionInteraction
): NodalConnectionDraftPortRef | null {
  return interaction.phase === 'idle' ? null : interaction.draft;
}

export function getConnectionInteractionPointerId(
  interaction: NodalConnectionInteraction
): number | null {
  return interaction.phase === 'idle' ? null : interaction.pointerId;
}

export function getSuspendedInputEdge(
  interaction: NodalConnectionInteraction
): NodalSuspendedInputEdgeRef | null {
  return interaction.phase === 'idle' ? null : interaction.suspendedEdge;
}

export function isDetachedInputOriginPort(
  interaction: NodalConnectionInteraction,
  port: Pick<NodalGraphPort, 'nodeId' | 'id'>,
  pointerId: number | undefined
): boolean {
  const suspendedEdge = getSuspendedInputEdge(interaction);
  const interactionPointerId = getConnectionInteractionPointerId(interaction);

  return Boolean(
    suspendedEdge &&
      pointerId !== undefined &&
      interactionPointerId === pointerId &&
      suspendedEdge.input.nodeId === port.nodeId &&
      suspendedEdge.input.portId === port.id
  );
}

export function isDetachedInputOriginPortById(
  interaction: NodalConnectionInteraction,
  nodeId: string,
  portId: string
): boolean {
  const suspendedEdge = getSuspendedInputEdge(interaction);

  return Boolean(suspendedEdge && suspendedEdge.input.nodeId === nodeId && suspendedEdge.input.portId === portId);
}

export function shouldCancelFreshConnectionOnDropOutside(
  interaction: NodalConnectionInteraction
): boolean {
  return interaction.phase === 'draft' && interaction.dropOutsidePolicy === 'cancel';
}

export function shouldDeleteDetachedConnectionOnDropOutside(
  interaction: NodalConnectionInteraction,
  _pointerId: number | undefined
): boolean {
  return Boolean(interaction.phase === 'draft' && interaction.dropOutsidePolicy === 'delete');
}
