export type NodalCoordinatePoint = {
  x: number;
  y: number;
};

export type NodalCoordinateViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type NodalCanvasFrame = {
  worldMinX: number;
  worldMinY: number;
};

export type NodalScreenSpaceTransform = {
  zoom: number;
  screenOrigin: NodalCoordinatePoint;
};

export function worldToScreenPoint(
  point: NodalCoordinatePoint,
  viewport: NodalCoordinateViewport
): NodalCoordinatePoint {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y
  };
}

export function screenToWorldPoint(
  point: NodalCoordinatePoint,
  viewport: NodalCoordinateViewport
): NodalCoordinatePoint {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom
  };
}

export function worldToCanvasLocalPoint(
  point: NodalCoordinatePoint,
  canvasFrame: NodalCanvasFrame
): NodalCoordinatePoint {
  return {
    x: point.x - canvasFrame.worldMinX,
    y: point.y - canvasFrame.worldMinY
  };
}

export function canvasLocalToWorldPoint(
  point: NodalCoordinatePoint,
  canvasFrame: NodalCanvasFrame
): NodalCoordinatePoint {
  return {
    x: point.x + canvasFrame.worldMinX,
    y: point.y + canvasFrame.worldMinY
  };
}

export function getCanvasScreenOrigin(
  canvasFrame: NodalCanvasFrame,
  viewport: NodalCoordinateViewport
): NodalCoordinatePoint {
  return worldToScreenPoint(
    {
      x: canvasFrame.worldMinX,
      y: canvasFrame.worldMinY
    },
    viewport
  );
}

export function localToScreenPoint(
  point: NodalCoordinatePoint,
  transform: NodalScreenSpaceTransform
): NodalCoordinatePoint {
  return {
    x: point.x * transform.zoom + transform.screenOrigin.x,
    y: point.y * transform.zoom + transform.screenOrigin.y
  };
}

export function screenToLocalPoint(
  point: NodalCoordinatePoint,
  transform: NodalScreenSpaceTransform
): NodalCoordinatePoint {
  return {
    x: (point.x - transform.screenOrigin.x) / transform.zoom,
    y: (point.y - transform.screenOrigin.y) / transform.zoom
  };
}

export function canvasLocalToScreenPoint(
  point: NodalCoordinatePoint,
  input: {
    viewport: NodalCoordinateViewport;
    canvasFrame: NodalCanvasFrame;
  }
): NodalCoordinatePoint {
  return localToScreenPoint(point, {
    zoom: input.viewport.zoom,
    screenOrigin: getCanvasScreenOrigin(input.canvasFrame, input.viewport)
  });
}

export function screenToCanvasLocalPoint(
  point: NodalCoordinatePoint,
  input: {
    viewport: Pick<NodalCoordinateViewport, 'zoom'>;
    screenOrigin: NodalCoordinatePoint;
  }
): NodalCoordinatePoint {
  return screenToLocalPoint(point, {
    zoom: input.viewport.zoom,
    screenOrigin: input.screenOrigin
  });
}

export function snapWorldPointToCanvasLocalPixels(
  point: NodalCoordinatePoint,
  input: {
    viewport: NodalCoordinateViewport;
    canvasFrame: NodalCanvasFrame;
  }
): NodalCoordinatePoint {
  const canvasScreenOrigin = getCanvasScreenOrigin(input.canvasFrame, input.viewport);
  const snappedCanvasScreenOrigin = {
    x: Math.round(canvasScreenOrigin.x),
    y: Math.round(canvasScreenOrigin.y)
  };
  const snappedScreenPoint = {
    x: Math.round(worldToScreenPoint(point, input.viewport).x),
    y: Math.round(worldToScreenPoint(point, input.viewport).y)
  };

  return screenToCanvasLocalPoint(snappedScreenPoint, {
    viewport: input.viewport,
    screenOrigin: snappedCanvasScreenOrigin
  });
}

export function getNodalConnectorKey(nodeId: string, portId: string, direction: 'input' | 'output'): string {
  return `${nodeId}:${direction}:${portId}`;
}
