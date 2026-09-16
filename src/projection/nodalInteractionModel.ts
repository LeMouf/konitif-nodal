import type { NodalGraphDocument, NodalGraphNode, NodalGraphPort } from '../types/model.js';
import type { NodalConnectionDraftPortRef } from './nodalConnectionInteractionModel.js';
import { getNodalConnectorKey } from './nodalCoordinateModel.js';

export type NodalDraftPortMatch = {
  node: NodalGraphNode;
  port: NodalGraphPort;
};

export type NodalLassoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NodalConnectionEndpoints = {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
};

export type NodalPointerPoint = {
  x: number;
  y: number;
};

export function isViewportPanGesture(input: {
  button: number;
  altKey: boolean;
  isPrimaryModifier: boolean;
}): boolean {
  return input.button === 1 || input.altKey || (input.button === 0 && !input.isPrimaryModifier);
}



export function resolveDraggedNodeDelta(input: {
  pointerStart: NodalPointerPoint;
  pointerCurrent: NodalPointerPoint;
  zoom: number;
}): NodalPointerPoint {
  return {
    x: (input.pointerCurrent.x - input.pointerStart.x) / input.zoom,
    y: (input.pointerCurrent.y - input.pointerStart.y) / input.zoom
  };
}

export function resolveViewportPanOffset(input: {
  viewportStart: NodalPointerPoint;
  pointerStart: NodalPointerPoint;
  pointerCurrent: NodalPointerPoint;
}): NodalPointerPoint {
  return {
    x: input.viewportStart.x + input.pointerCurrent.x - input.pointerStart.x,
    y: input.viewportStart.y + input.pointerCurrent.y - input.pointerStart.y
  };
}

export function resolveNodeDragSelection(
  selectedNodeIds: string[],
  nodeId: string,
  multi: boolean
): string[] {
  if (multi) {
    return selectedNodeIds.includes(nodeId) ? selectedNodeIds : [...selectedNodeIds, nodeId];
  }

  if (selectedNodeIds.length > 1 && selectedNodeIds.includes(nodeId)) {
    return selectedNodeIds;
  }

  return [nodeId];
}

export function resolveConnectionDraftPort(
  graph: Pick<NodalGraphDocument, 'nodes'>,
  draft: NodalConnectionDraftPortRef | null
): NodalDraftPortMatch | null {
  if (!draft) {
    return null;
  }

  const node = graph.nodes.find((candidate) => candidate.id === draft.nodeId);
  const ports = draft.direction === 'input' ? node?.inputs : node?.outputs;
  const port = ports?.find((candidate) => candidate.id === draft.portId) ?? null;

  if (!node || !port) {
    return null;
  }

  return { node, port };
}

export function isPortCompatibleWithDraft(
  draft: NodalConnectionDraftPortRef,
  draftPort: Pick<NodalGraphPort, 'direction' | 'dataType' | 'mode'> | null,
  port: Pick<NodalGraphPort, 'direction' | 'dataType' | 'mode'>
): boolean {
  if (!draftPort) {
    return false;
  }

  return (
    port.direction !== draft.direction &&
    port.dataType === draftPort.dataType &&
    port.mode === draftPort.mode
  );
}

export function resolveConnectionEndpoints(
  draft: NodalConnectionDraftPortRef,
  port: Pick<NodalGraphPort, 'nodeId' | 'id'>
): NodalConnectionEndpoints {
  return draft.direction === 'output'
    ? {
        sourceNodeId: draft.nodeId,
        sourcePortId: draft.portId,
        targetNodeId: port.nodeId,
        targetPortId: port.id
      }
    : {
        sourceNodeId: port.nodeId,
        sourcePortId: port.id,
        targetNodeId: draft.nodeId,
        targetPortId: draft.portId
      };
}

export function resolveClosestCompatiblePort(input: {
  graph: Pick<NodalGraphDocument, 'nodes'>;
  draft: NodalConnectionDraftPortRef;
  draftPort: Pick<NodalGraphPort, 'direction' | 'dataType' | 'mode'> | null;
  point: { x: number; y: number };
  portAnchorsByKey: Record<string, { x: number; y: number }>;
  maxDistance?: number;
}): NodalGraphPort | null {
  const maxDistance = input.maxDistance ?? 18;
  const ports = input.graph.nodes.flatMap((node) =>
    (input.draft.direction === 'output' ? node.inputs : node.outputs)
      .filter((port) => isPortCompatibleWithDraft(input.draft, input.draftPort, port))
      .map((port) => ({
        port,
        anchor: input.portAnchorsByKey[getNodalConnectorKey(node.id, port.id, port.direction)]
      }))
      .filter((entry) => Boolean(entry.anchor))
  );

  let closestMatch: { port: NodalGraphPort; distance: number } | null = null;

  for (const entry of ports) {
    if (!entry.anchor) {
      continue;
    }

    const distance = Math.hypot(entry.anchor.x - input.point.x, entry.anchor.y - input.point.y);

    if (distance > maxDistance) {
      continue;
    }

    if (!closestMatch || distance < closestMatch.distance) {
      closestMatch = {
        port: entry.port,
        distance
      };
    }
  }

  return closestMatch?.port ?? null;
}

export function resolveDraftCandidatePort(input: {
  graph: Pick<NodalGraphDocument, 'nodes'>;
  draft: NodalConnectionDraftPortRef | null;
  hoveredPort: NodalGraphPort | null;
  pointerCanvasPoint: { x: number; y: number };
  portAnchorsByKey: Record<string, { x: number; y: number }>;
  isDetachedOriginPortById?: (nodeId: string, portId: string) => boolean;
}): NodalGraphPort | null {
  if (!input.draft) {
    return null;
  }

  const draftPort = resolveConnectionDraftPort(input.graph, input.draft)?.port ?? null;
  const isDetachedOriginPortById = input.isDetachedOriginPortById ?? (() => false);
  const hoveredPort =
    input.hoveredPort &&
    isPortCompatibleWithDraft(input.draft, draftPort, input.hoveredPort) &&
    !isDetachedOriginPortById(input.hoveredPort.nodeId, input.hoveredPort.id)
      ? input.hoveredPort
      : null;
  const candidatePort =
    hoveredPort ??
    resolveClosestCompatiblePort({
      graph: input.graph,
      draft: input.draft,
      draftPort,
      point: input.pointerCanvasPoint,
      portAnchorsByKey: input.portAnchorsByKey
    });

  if (!candidatePort || isDetachedOriginPortById(candidatePort.nodeId, candidatePort.id)) {
    return null;
  }

  return candidatePort;
}

export function resolveLassoRect(
  lassoStart: { x: number; y: number } | null,
  lassoCurrent: { x: number; y: number } | null
): NodalLassoRect | null {
  if (!lassoStart || !lassoCurrent) {
    return null;
  }

  return {
    x: Math.min(lassoStart.x, lassoCurrent.x),
    y: Math.min(lassoStart.y, lassoCurrent.y),
    width: Math.abs(lassoCurrent.x - lassoStart.x),
    height: Math.abs(lassoCurrent.y - lassoStart.y)
  };
}

export function resolveLassoSelectionNodeIds(input: {
  lassoStart: { x: number; y: number } | null;
  lassoCurrent: { x: number; y: number } | null;
  minSize: number;
  nodes: Array<Pick<NodalGraphNode, 'id'>>;
  nodeLayoutsById: Record<
    string,
    {
      position: { x: number; y: number };
      width: number;
      height: number;
    }
  >;
}): string[] | null {
  const lassoRect = resolveLassoRect(input.lassoStart, input.lassoCurrent);

  if (!lassoRect || lassoRect.width < input.minSize || lassoRect.height < input.minSize) {
    return null;
  }

  const maxX = lassoRect.x + lassoRect.width;
  const maxY = lassoRect.y + lassoRect.height;

  return input.nodes
    .filter((node) => {
      const nodeLayout = input.nodeLayoutsById[node.id];

      if (!nodeLayout) {
        return false;
      }

      return (
        nodeLayout.position.x >= lassoRect.x &&
        nodeLayout.position.x + nodeLayout.width <= maxX &&
        nodeLayout.position.y >= lassoRect.y &&
        nodeLayout.position.y + nodeLayout.height <= maxY
      );
    })
    .map((node) => node.id);
}
