import type { NodalGraphDocument } from '../types/model.js';

export type NodalGroupLayoutMode = 'masonry' | 'row' | 'column' | 'grid';

export type NodalGroupResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export type NodalGroupLayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NodalGroupLayoutFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const GROUP_LAYOUT_PADDING_X = 36;
const GROUP_LAYOUT_PADDING_TOP = 60;
const GROUP_LAYOUT_GAP_X = 32;
const GROUP_LAYOUT_GAP_Y = 30;
const GROUP_LAYOUT_MIN_WIDTH = 220;
const GROUP_LAYOUT_MIN_HEIGHT = 160;

export function applyNodalGroupNodePositions(
  graph: NodalGraphDocument,
  positions: Record<string, { x: number; y: number }>
): NodalGraphDocument {
  const nextNodes = graph.nodes.map((node) => {
    const position = positions[node.id];

    if (!position) {
      return node;
    }

    return {
      ...node,
      position: {
        x: roundPosition(position.x),
        y: roundPosition(position.y)
      }
    };
  });

  return nextNodes.some((node, index) => node !== graph.nodes[index]) ? { ...graph, nodes: nextNodes } : graph;
}

export function resolveNodalGroupLayoutPositions(input: {
  nodes: readonly NodalGroupLayoutNode[];
  frame: NodalGroupLayoutFrame;
  mode: NodalGroupLayoutMode;
}): Record<string, { x: number; y: number }> {
  if (input.nodes.length === 0) {
    return {};
  }

  const nodes = [...input.nodes].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const contentLeft = input.frame.left + GROUP_LAYOUT_PADDING_X;
  const contentTop = input.frame.top + GROUP_LAYOUT_PADDING_TOP;
  const contentWidth = Math.max(
    Math.max(...nodes.map((node) => node.width)),
    input.frame.width - GROUP_LAYOUT_PADDING_X * 2
  );

  if (input.mode === 'row') {
    return Object.fromEntries(
      nodes.map((node, index) => [
        node.id,
        {
          x: contentLeft + index * (Math.max(...nodes.map((candidate) => candidate.width)) + GROUP_LAYOUT_GAP_X),
          y: contentTop
        }
      ])
    );
  }

  if (input.mode === 'column') {
    return Object.fromEntries(
      nodes.map((node, index) => [
        node.id,
        {
          x: contentLeft,
          y: contentTop + index * (Math.max(...nodes.map((candidate) => candidate.height)) + GROUP_LAYOUT_GAP_Y)
        }
      ])
    );
  }

  const maxNodeWidth = Math.max(...nodes.map((node) => node.width));
  const maxNodeHeight = Math.max(...nodes.map((node) => node.height));
  const columnCount =
    input.mode === 'grid'
      ? Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
      : Math.max(1, Math.floor((contentWidth + GROUP_LAYOUT_GAP_X) / (maxNodeWidth + GROUP_LAYOUT_GAP_X)));

  if (input.mode === 'grid') {
    return Object.fromEntries(
      nodes.map((node, index) => [
        node.id,
        {
          x: contentLeft + (index % columnCount) * (maxNodeWidth + GROUP_LAYOUT_GAP_X),
          y: contentTop + Math.floor(index / columnCount) * (maxNodeHeight + GROUP_LAYOUT_GAP_Y)
        }
      ])
    );
  }

  const columnHeights = Array.from({ length: columnCount }, () => contentTop);
  const positions: Record<string, { x: number; y: number }> = {};

  for (const node of nodes) {
    const columnIndex = columnHeights.reduce(
      (bestIndex, height, index) => (height < columnHeights[bestIndex]! ? index : bestIndex),
      0
    );

    positions[node.id] = {
      x: contentLeft + columnIndex * (maxNodeWidth + GROUP_LAYOUT_GAP_X),
      y: columnHeights[columnIndex]!
    };
    columnHeights[columnIndex] += node.height + GROUP_LAYOUT_GAP_Y;
  }

  return positions;
}

export function resolveNodalGroupResizeFrame(input: {
  frame: NodalGroupLayoutFrame;
  handle: NodalGroupResizeHandle;
  delta: { x: number; y: number };
}): NodalGroupLayoutFrame {
  let left = input.frame.left;
  let top = input.frame.top;
  let width = input.frame.width;
  let height = input.frame.height;

  if (input.handle.includes('e')) {
    width += input.delta.x;
  }

  if (input.handle.includes('s')) {
    height += input.delta.y;
  }

  if (input.handle.includes('w')) {
    left += input.delta.x;
    width -= input.delta.x;
  }

  if (input.handle.includes('n')) {
    top += input.delta.y;
    height -= input.delta.y;
  }

  if (width < GROUP_LAYOUT_MIN_WIDTH) {
    if (input.handle.includes('w')) {
      left -= GROUP_LAYOUT_MIN_WIDTH - width;
    }

    width = GROUP_LAYOUT_MIN_WIDTH;
  }

  if (height < GROUP_LAYOUT_MIN_HEIGHT) {
    if (input.handle.includes('n')) {
      top -= GROUP_LAYOUT_MIN_HEIGHT - height;
    }

    height = GROUP_LAYOUT_MIN_HEIGHT;
  }

  return {
    left: roundPosition(left),
    top: roundPosition(top),
    width: roundPosition(width),
    height: roundPosition(height)
  };
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}
