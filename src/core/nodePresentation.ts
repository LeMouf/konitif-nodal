import type { NodalGraphNode, NodalGraphPort } from '../types/model.js';
import { getNodalDialectPresentation } from '../dialects/presentation.js';
import { getNodalNodeFamily, isNodalInlineConfigNode } from './nodeSemantics.js';

export type NodalInlineConfigInputType = 'text' | 'checkbox';
export type NodalPortSemanticRole = 'param' | 'model' | 'computed' | 'action';

export function getNodalSignalAccent(
  port: NodalGraphPort | null,
  node: NodalGraphNode | null,
  dialectId?: string | null
): string {
  if (port?.dataType === 'number') {
    return 'var(--nws-signal-number)';
  }

  if (port?.dataType === 'boolean') {
    return 'var(--nws-signal-boolean)';
  }

  if (port?.dataType === 'string') {
    return 'var(--nws-signal-string)';
  }

  if (port?.dataType.startsWith('vec')) {
    return 'var(--nws-signal-vector)';
  }

  if (port?.dataType === 'object') {
    return 'var(--nws-signal-object)';
  }

  if (node) {
    return getNodalNodeAccent(node, dialectId);
  }

  return getNodalDialectPresentation(dialectId).families.source.color;
}

export function getNodalSignalAccentRgb(
  port: NodalGraphPort | null,
  node: NodalGraphNode | null,
  dialectId?: string | null
): string {
  if (port?.dataType === 'number') {
    return '134, 185, 255';
  }

  if (port?.dataType === 'boolean') {
    return '125, 224, 176';
  }

  if (port?.dataType === 'string') {
    return '240, 154, 87';
  }

  if (port?.dataType.startsWith('vec')) {
    return '255, 213, 106';
  }

  if (port?.dataType === 'object') {
    return '215, 168, 255';
  }

  const presentation = getNodalDialectPresentation(dialectId);

  if (node) {
    const nodeTypeAccent = presentation.nodeTypeAccents?.[node.type];

    if (nodeTypeAccent) {
      return nodeTypeAccent.rgb;
    }
  }

  if (node && getNodalNodeFamily(node) === 'output') {
    return presentation.families.output.rgb;
  }

  if (node && getNodalNodeFamily(node) === 'compute') {
    return presentation.families.compute.rgb;
  }

  return presentation.families.source.rgb;
}

export function getNodalSignalDasharray(port: NodalGraphPort | null): string | null {
  if (port?.mode === 'event') {
    return '4 8';
  }

  if (port?.mode === 'control') {
    return '10 8';
  }

  return null;
}

export function getNodalNodeAccent(node: NodalGraphNode, dialectId?: string | null): string {
  if (node.appearance?.color) {
    return node.appearance.color;
  }

  const presentation = getNodalDialectPresentation(dialectId);
  const nodeTypeAccent = presentation.nodeTypeAccents?.[node.type];

  if (nodeTypeAccent) {
    return nodeTypeAccent.color;
  }

  const family = getNodalNodeFamily(node);

  if (family === 'source') {
    return presentation.families.source.color;
  }

  if (family === 'output') {
    return presentation.families.output.color;
  }

  return presentation.families.compute.color;
}

export function getNodalNodeFamilyLabel(node: NodalGraphNode, dialectId?: string | null): string {
  const family = getNodalNodeFamily(node);
  const labels = getNodalDialectPresentation(dialectId).familyLabels;
  return labels?.[family] ?? (family === 'source' ? 'Source' : family === 'output' ? 'Output' : 'Compute');
}

export function formatNodalValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  if (value == null) {
    return 'Ready';
  }

  return 'Object';
}

export function resolveNodalOutputPortValue(node: NodalGraphNode, port: NodalGraphPort): string | null {
  const runtimeValue = node.state?.outputs?.[port.id];

  if (runtimeValue !== undefined) {
    return formatNodalValue(runtimeValue);
  }

  if (isNodalInlineConfigNode(node) && port.id === 'value') {
    return formatNodalValue(node.config.value ?? 0);
  }

  return null;
}

export function getNodalInlineConfigInputType(node: NodalGraphNode): NodalInlineConfigInputType {
  const configValue = node.config.value;

  if (typeof configValue === 'boolean') {
    return 'checkbox';
  }

  return 'text';
}

export function getNodalPortDisplayLabel(port: NodalGraphPort): string | null {
  if (port.direction === 'output' && port.label === 'Value') {
    return null;
  }

  return port.label;
}

export function getNodalPortSemanticRole(port: NodalGraphPort): NodalPortSemanticRole {
  if (port.direction === 'input') {
    return 'param';
  }

  if (port.mode === 'control') {
    return 'action';
  }

  if (port.id === 'value') {
    return 'model';
  }

  return 'computed';
}

export function getNodalPortSemanticLabel(port: NodalGraphPort): string {
  const role = getNodalPortSemanticRole(port);

  if (role === 'param') {
    return 'Param';
  }

  if (role === 'action') {
    return 'Action';
  }

  if (role === 'model') {
    return 'Model';
  }

  return 'Computed';
}

export function getNodalPortSemanticGlyph(port: NodalGraphPort): string {
  const role = getNodalPortSemanticRole(port);

  if (role === 'param') {
    return 'P';
  }

  if (role === 'action') {
    return 'A';
  }

  if (role === 'model') {
    return 'M';
  }

  return 'C';
}

export function getNodalPortAccessibilityLabel(port: NodalGraphPort): string {
  return `${port.label}, ${getNodalPortSemanticLabel(port)}, ${port.dataType}`;
}
