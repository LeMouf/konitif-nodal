export type AdaptiveViewport = { x: number; y: number; zoom: number };
export type AdaptiveViewportSize = { width: number; height: number };
export type AdaptiveViewportWindow = { centerX: number; centerY: number; width: number; height: number };

const positiveSize = (size: AdaptiveViewportSize) =>
  Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

export function captureAdaptiveViewportWindow(
  viewport: AdaptiveViewport,
  size: AdaptiveViewportSize
): AdaptiveViewportWindow | null {
  if (
    !positiveSize(size) ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0 ||
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y)
  )
    return null;
  return {
    centerX: (size.width / 2 - viewport.x) / viewport.zoom,
    centerY: (size.height / 2 - viewport.y) / viewport.zoom,
    width: size.width / viewport.zoom,
    height: size.height / viewport.zoom
  };
}

/** Contains the previously visible rectangle, not the whole graph. There is
 * deliberately no interaction zoom floor: it would crop on a small panel. */
export function containAdaptiveViewportWindow(
  window: AdaptiveViewportWindow,
  size: AdaptiveViewportSize,
  maxZoom = Infinity
): AdaptiveViewport | null {
  if (
    !positiveSize(size) ||
    !positiveSize(window) ||
    !Number.isFinite(window.centerX) ||
    !Number.isFinite(window.centerY) ||
    !(maxZoom > 0)
  )
    return null;
  const zoom = Math.min(size.width / window.width, size.height / window.height, maxZoom);
  return { x: size.width / 2 - window.centerX * zoom, y: size.height / 2 - window.centerY * zoom, zoom };
}

/** Keep one reference through successive layout measurements. Re-capturing at
 * each resize would progressively zoom out when aspect ratios alternate. */
export function createAdaptiveViewportResizeController() {
  let window: AdaptiveViewportWindow | null = null;
  let applied: AdaptiveViewport | null = null;
  return {
    reset() {
      window = null;
      applied = null;
    },
    resize(input: {
      viewport: AdaptiveViewport;
      previousSize: AdaptiveViewportSize;
      nextSize: AdaptiveViewportSize;
      maxZoom?: number;
    }): AdaptiveViewport {
      if (!positiveSize(input.previousSize) || !positiveSize(input.nextSize)) return input.viewport;
      if (
        input.previousSize.width === input.nextSize.width &&
        input.previousSize.height === input.nextSize.height
      )
        return input.viewport;
      // A consumer may quantize persisted presentation to 0.001. Explicit
      // gesture resets take precedence; this fallback admits external cameras.
      if (
        !applied ||
        Math.abs(applied.x - input.viewport.x) > 0.001 ||
        Math.abs(applied.y - input.viewport.y) > 0.001 ||
        Math.abs(applied.zoom - input.viewport.zoom) > 0.001
      ) {
        window = captureAdaptiveViewportWindow(input.viewport, input.previousSize);
      }
      const next = window && containAdaptiveViewportWindow(window, input.nextSize, input.maxZoom);
      if (!next) return input.viewport;
      applied = next;
      return next;
    }
  };
}
