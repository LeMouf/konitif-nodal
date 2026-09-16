import {
  screenToWorldPoint as screenToWorldPointFromCoordinateModel,
  worldToScreenPoint as worldToScreenPointFromCoordinateModel
} from './nodalCoordinateModel.js';

export type NodalViewportProjectionInput = {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  gridMinorSize?: number;
  gridMajorFactor?: number;
  gridSuperMajorFactor?: number;
  originPadding?: number;
};

export type NodalViewportPoint = {
  x: number;
  y: number;
};

export type NodalViewportSize = {
  width: number;
  height: number;
};

export type NodalViewportResizeStrategy = 'none' | 'measure' | 'frame' | 'recenter';

export type NodalViewportProjection = {
  gridDensityLevel: number;
  gridDensityScale: number;
  gridMinorWorldSize: number;
  gridMajorWorldSize: number;
  gridSuperMajorWorldSize: number;
  gridMinorScreenSize: number;
  gridMajorScreenSize: number;
  gridSuperMajorScreenSize: number;
  gridMinorOffsetX: number;
  gridMinorOffsetY: number;
  gridMajorOffsetX: number;
  gridMajorOffsetY: number;
  gridSuperMajorOffsetX: number;
  gridSuperMajorOffsetY: number;
  minorGridOpacity: number;
  majorGridOpacity: number;
  superMajorGridOpacity: number;
  dotGridOpacity: number;
  originAxisOpacity: number;
  originAxisScreenX: number;
  originAxisScreenY: number;
  originVisibleX: number;
  originVisibleY: number;
  originMarkVisible: boolean;
  originLabelOpacity: number;
  originLabelPosition: NodalViewportPoint;
};

export type NodalGridPatternIds = {
  minorPatternId: string;
  majorPatternId: string;
  superMajorPatternId: string;
  dotPatternId: string;
  verticalBandPatternId: string;
  horizontalBandPatternId: string;
};

export type NodalWorldGridOffsets = {
  worldMinorGridOffsetX: number;
  worldMinorGridOffsetY: number;
  worldMajorGridOffsetX: number;
  worldMajorGridOffsetY: number;
  worldSuperMajorGridOffsetX: number;
  worldSuperMajorGridOffsetY: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function resolveRenderedWorldOriginScreenPoint(input: {
  canvasScreenOrigin: NodalViewportPoint;
  canvasWorldMin: NodalViewportPoint;
  zoom: number;
}): NodalViewportPoint {
  return {
    x: input.canvasScreenOrigin.x - input.canvasWorldMin.x * input.zoom + 0.5,
    y: input.canvasScreenOrigin.y - input.canvasWorldMin.y * input.zoom + 0.5
  };
}

export function resolveOriginLabelScreenPosition(input: {
  originScreenPoint: NodalViewportPoint;
  viewportSize: NodalViewportSize;
  originPadding?: number;
  labelOffset?: number;
}): NodalViewportPoint {
  const originPadding = input.originPadding ?? 18;
  const labelOffset = input.labelOffset ?? 10;

  return {
    x: Math.round(
      clamp(
        input.originScreenPoint.x,
        originPadding,
        Math.max(originPadding, input.viewportSize.width - originPadding)
      ) + labelOffset
    ),
    y: Math.round(
      clamp(
        input.originScreenPoint.y,
        originPadding,
        Math.max(originPadding, input.viewportSize.height - originPadding)
      ) + labelOffset
    )
  };
}

export function positiveModulo(value: number, base: number): number {
  return ((value % base) + base) % base;
}

export function createNodalGridPatternIds(gridIdPrefix: string): NodalGridPatternIds {
  return {
    minorPatternId: `${gridIdPrefix}-minor`,
    majorPatternId: `${gridIdPrefix}-major`,
    superMajorPatternId: `${gridIdPrefix}-super-major`,
    dotPatternId: `${gridIdPrefix}-dot`,
    verticalBandPatternId: `${gridIdPrefix}-band-vertical`,
    horizontalBandPatternId: `${gridIdPrefix}-band-horizontal`
  };
}

export function resolveNodalWorldGridOffsets(input: {
  canvasWorldMin: NodalViewportPoint;
  projection: Pick<
    NodalViewportProjection,
    'gridMinorWorldSize' | 'gridMajorWorldSize' | 'gridSuperMajorWorldSize'
  >;
}): NodalWorldGridOffsets {
  return {
    worldMinorGridOffsetX: positiveModulo(-input.canvasWorldMin.x, input.projection.gridMinorWorldSize),
    worldMinorGridOffsetY: positiveModulo(-input.canvasWorldMin.y, input.projection.gridMinorWorldSize),
    worldMajorGridOffsetX: positiveModulo(-input.canvasWorldMin.x, input.projection.gridMajorWorldSize),
    worldMajorGridOffsetY: positiveModulo(-input.canvasWorldMin.y, input.projection.gridMajorWorldSize),
    worldSuperMajorGridOffsetX: positiveModulo(-input.canvasWorldMin.x, input.projection.gridSuperMajorWorldSize),
    worldSuperMajorGridOffsetY: positiveModulo(-input.canvasWorldMin.y, input.projection.gridSuperMajorWorldSize)
  };
}

export function worldPointToScreenPoint(
  point: NodalViewportPoint,
  viewport: Pick<NodalViewportProjectionInput, 'x' | 'y' | 'zoom'>
): NodalViewportPoint {
  return worldToScreenPointFromCoordinateModel(point, viewport);
}

export function screenPointToWorldPoint(
  point: NodalViewportPoint,
  viewport: Pick<NodalViewportProjectionInput, 'x' | 'y' | 'zoom'>
): NodalViewportPoint {
  return screenToWorldPointFromCoordinateModel(point, viewport);
}

export function scaleViewportAroundScreenPoint(input: {
  viewport: Pick<NodalViewportProjectionInput, 'x' | 'y' | 'zoom'>;
  screenPoint: NodalViewportPoint;
  nextZoom: number;
}): Pick<NodalViewportProjectionInput, 'x' | 'y' | 'zoom'> {
  const worldPoint = screenPointToWorldPoint(input.screenPoint, input.viewport);

  return {
    x: input.screenPoint.x - worldPoint.x * input.nextZoom,
    y: input.screenPoint.y - worldPoint.y * input.nextZoom,
    zoom: input.nextZoom
  };
}

export function recenterViewportForSizeChange(input: {
  viewport: Pick<NodalViewportProjectionInput, 'x' | 'y' | 'zoom'>;
  previousSize: NodalViewportSize;
  nextSize: NodalViewportSize;
}): Pick<NodalViewportProjectionInput, 'x' | 'y' | 'zoom'> {
  if (
    input.previousSize.width <= 0 ||
    input.previousSize.height <= 0 ||
    (
      input.previousSize.width === input.nextSize.width &&
      input.previousSize.height === input.nextSize.height
    )
  ) {
    return input.viewport;
  }

  return {
    ...input.viewport,
    x: input.viewport.x + (input.nextSize.width - input.previousSize.width) * 0.5,
    y: input.viewport.y + (input.nextSize.height - input.previousSize.height) * 0.5
  };
}

export function resolveNodalViewportResizeStrategy(input: {
  previousSize: NodalViewportSize;
  nextSize: NodalViewportSize;
  viewportHasUserOverride: boolean;
}): NodalViewportResizeStrategy {
  if (
    input.nextSize.width <= 0 ||
    input.nextSize.height <= 0 ||
    (
      input.previousSize.width === input.nextSize.width &&
      input.previousSize.height === input.nextSize.height
    )
  ) {
    return 'none';
  }

  if (input.previousSize.width <= 0 || input.previousSize.height <= 0) {
    return input.viewportHasUserOverride ? 'measure' : 'frame';
  }

  return 'recenter';
}

export function createNodalViewportProjection(input: NodalViewportProjectionInput): NodalViewportProjection {
  const gridMinorSize = input.gridMinorSize ?? 24;
  const gridMajorFactor = input.gridMajorFactor ?? 5;
  const gridSuperMajorFactor = input.gridSuperMajorFactor ?? 2;
  const originPadding = input.originPadding ?? 18;
  const safeZoom = Math.max(0.0001, input.zoom);
  const targetMinorScreenSize = 24;
  const gridDensityLevel = Math.max(
    -3,
    Math.min(6, Math.round(Math.log2(targetMinorScreenSize / (gridMinorSize * safeZoom))))
  );
  const gridDensityScale = 2 ** gridDensityLevel;
  const gridMinorWorldSize = gridMinorSize * gridDensityScale;
  const gridMajorWorldSize = gridMinorWorldSize * gridMajorFactor;
  const gridSuperMajorWorldSize = gridMajorWorldSize * gridSuperMajorFactor;
  const gridMinorScreenSize = gridMinorWorldSize * safeZoom;
  const gridMajorScreenSize = gridMajorWorldSize * safeZoom;
  const gridSuperMajorScreenSize = gridSuperMajorWorldSize * safeZoom;

  return {
    gridDensityLevel,
    gridDensityScale,
    gridMinorWorldSize,
    gridMajorWorldSize,
    gridSuperMajorWorldSize,
    gridMinorScreenSize,
    gridMajorScreenSize,
    gridSuperMajorScreenSize,
    gridMinorOffsetX: positiveModulo(input.x, gridMinorScreenSize),
    gridMinorOffsetY: positiveModulo(input.y, gridMinorScreenSize),
    gridMajorOffsetX: positiveModulo(input.x, gridMajorScreenSize),
    gridMajorOffsetY: positiveModulo(input.y, gridMajorScreenSize),
    gridSuperMajorOffsetX: positiveModulo(input.x, gridSuperMajorScreenSize),
    gridSuperMajorOffsetY: positiveModulo(input.y, gridSuperMajorScreenSize),
    minorGridOpacity: 0.38 + clamp01((gridMinorScreenSize - 17) / 14) * 0.24,
    majorGridOpacity: 0.5 + clamp01((gridMinorScreenSize - 17) / 14) * 0.16,
    superMajorGridOpacity: 0.42 + clamp01((31 - gridMinorScreenSize) / 14) * 0.18,
    dotGridOpacity: clamp01((input.zoom - 0.62) / 0.42) * 0.82,
    originAxisOpacity: 0.22 + clamp01((input.zoom - 0.4) / 1.2) * 0.28,
    originAxisScreenX: Math.round(input.x) + 0.5,
    originAxisScreenY: Math.round(input.y) + 0.5,
    originVisibleX: clamp(input.x, originPadding, Math.max(originPadding, input.width - originPadding)),
    originVisibleY: clamp(input.y, originPadding, Math.max(originPadding, input.height - originPadding)),
    originMarkVisible:
      input.x >= -14 && input.x <= input.width + 14 && input.y >= -14 && input.y <= input.height + 14,
    originLabelOpacity: 0.28 + clamp01((input.zoom - 0.36) / 0.9) * 0.28,
    originLabelPosition: {
      x: Math.round(clamp(input.x, originPadding, Math.max(originPadding, input.width - originPadding)) + 10),
      y: Math.round(clamp(input.y, originPadding, Math.max(originPadding, input.height - originPadding)) + 10)
    }
  };
}
