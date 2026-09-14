export type NodalGraphValueType = 'number' | 'boolean' | 'string' | 'vec2' | 'vec3' | 'vec4' | 'object';
export type NodalPortMode = 'value' | 'event' | 'control';
export type NodalPortDirection = 'input' | 'output';
export type NodalNodeExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'missing';
export type NodalNodeMode = 'always' | 'never' | 'bypass';

export interface NodalGraphNodeBadge {
  id: string;
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export interface NodalGraphNodeSource {
  label: string;
  kind?: string | null;
  packageId?: string | null;
}

export interface NodalGraphNodeAppearance {
  color?: string | null;
}

export interface NodalGraphPort {
  id: string;
  nodeId: string;
  label: string;
  direction: NodalPortDirection;
  dataType: NodalGraphValueType;
  mode: NodalPortMode;
}

export interface NodalNodeState {
  status: NodalNodeExecutionStatus;
  message?: string | null;
  outputs?: Record<string, unknown>;
}

export interface NodalGraphNode {
  id: string;
  type: string;
  title: string;
  mode: NodalNodeMode;
  locked: boolean;
  source?: NodalGraphNodeSource | null;
  badges?: NodalGraphNodeBadge[];
  appearance?: NodalGraphNodeAppearance;
  missingDefinition?: boolean;
  position: {
    x: number;
    y: number;
  };
  inputs: NodalGraphPort[];
  outputs: NodalGraphPort[];
  config: Record<string, unknown>;
  state?: NodalNodeState;
}

export interface NodalGraphEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface NodalGraphGroup {
  id: string;
  label: string;
  nodeIds: string[];
  color?: string;
}

export interface NodalGraphSelection {
  nodeIds: string[];
  edgeIds: string[];
}

export interface NodalGraphDocument {
  id: string;
  version: 1;
  dialect: string;
  nodes: NodalGraphNode[];
  edges: NodalGraphEdge[];
  groups: NodalGraphGroup[];
  metadata: Record<string, unknown>;
}

export interface NodalRuntimeNodeResult {
  outputs: Record<string, unknown>;
  message?: string | null;
}

export interface NodalValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface NodalValidationResult {
  valid: boolean;
  issues: NodalValidationIssue[];
}

export interface NodalExecutionResult {
  graph: NodalGraphDocument;
  outputsByNodeId: Record<string, Record<string, unknown>>;
  executionOrder: string[];
  validation: NodalValidationResult;
}
