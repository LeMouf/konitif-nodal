import { executeGraphDocument } from '../runtime/executeGraph.js';
import { resolveNodalExecutionPrimaryOutputValue } from '../core/nodeSemantics.js';
import type { NodalExecutionResult, NodalGraphDocument } from '../types/model.js';
import type { NodalDialect } from '../types/registry.js';
import { nodalGraphToWorkflow, workflowToNodalGraph } from './adapters/nodalGraphAdapter.js';
import type { CompositionShadowState } from './shadowEditing.js';

export type CompositionShadowGraphCompatibilityDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface CompositionShadowGraphCompatibilityDiagnostic {
  code: string;
  severity: CompositionShadowGraphCompatibilityDiagnosticSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface CompositionShadowGraphCompatibilityResult {
  kind: 'composition-shadow-graph-compatibility';
  staging: true;
  graph: NodalGraphDocument | null;
  executionResult: NodalExecutionResult | null;
  diagnostics: CompositionShadowGraphCompatibilityDiagnostic[];
}

export type CompositionShadowGraphCompatibilityParityDiagnosticKind =
  | 'adapter'
  | 'execution-order'
  | 'outputs'
  | 'primary-output'
  | 'runtime-error';

export interface CompositionShadowGraphCompatibilityParityDiagnostic {
  code: string;
  kind: CompositionShadowGraphCompatibilityParityDiagnosticKind;
  severity: CompositionShadowGraphCompatibilityDiagnosticSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface CompositionShadowGraphCompatibilityParityResult {
  kind: 'composition-shadow-graph-compatibility-parity';
  staging: true;
  matched: boolean;
  diagnostics: CompositionShadowGraphCompatibilityParityDiagnostic[];
}

export function executeCompositionShadowViaGraphCompatibility(input: {
  state: CompositionShadowState;
  dialect: NodalDialect;
}): CompositionShadowGraphCompatibilityResult {
  const diagnostics: CompositionShadowGraphCompatibilityDiagnostic[] = [];

  if (!input.state.diagnostics.valid) {
    diagnostics.push({
      code: 'composition-compatibility.shadow-diagnostics-present',
      severity: input.state.diagnostics.summary.errors > 0 ? 'error' : 'warning',
      message: 'Composition shadow diagnostics are present before graph compatibility execution.',
      details: {
        diagnostics: input.state.diagnostics.summary.total,
        errors: input.state.diagnostics.summary.errors,
        warnings: input.state.diagnostics.summary.warnings,
        infos: input.state.diagnostics.summary.infos
      }
    });
  }

  try {
    const sourceWorkflow = nodalGraphToWorkflow(input.state.graph);
    const compatibilityGraph = workflowToNodalGraph({
      ...sourceWorkflow,
      composition: structuredClone(input.state.composition)
    });
    const executionResult = executeGraphDocument(compatibilityGraph, input.dialect);

    return {
      kind: 'composition-shadow-graph-compatibility',
      staging: true,
      graph: compatibilityGraph,
      executionResult,
      diagnostics
    };
  } catch (error) {
    return {
      kind: 'composition-shadow-graph-compatibility',
      staging: true,
      graph: null,
      executionResult: null,
      diagnostics: [
        ...diagnostics,
        {
          code: 'composition-compatibility.adapter-error',
          severity: 'error',
          message: error instanceof Error ? error.message : 'Composition shadow graph compatibility adapter failed.'
        }
      ]
    };
  }
}

export function compareCompositionShadowCompatibilityResult(input: {
  directResult: NodalExecutionResult | null;
  compatibilityResult: CompositionShadowGraphCompatibilityResult;
}): CompositionShadowGraphCompatibilityParityResult {
  const diagnostics: CompositionShadowGraphCompatibilityParityDiagnostic[] = [];
  const compatibilityDiagnostics = input.compatibilityResult.diagnostics;
  const compatibilityExecutionResult = input.compatibilityResult.executionResult;

  if (compatibilityDiagnostics.length > 0) {
    diagnostics.push({
      code: 'composition-compatibility-parity.adapter-diagnostics-present',
      kind: 'adapter',
      severity: compatibilityDiagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : 'warning',
      message: 'Compatibility adapter reported staging diagnostics.',
      details: {
        diagnostics: compatibilityDiagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity
        }))
      }
    });
  }

  if (Boolean(input.directResult) !== Boolean(compatibilityExecutionResult)) {
    diagnostics.push({
      code: 'composition-compatibility-parity.runtime-result-presence-mismatch',
      kind: 'runtime-error',
      severity: 'error',
      message: 'Direct graph runtime and compatibility runtime did not both produce an execution result.',
      details: {
        directResultPresent: Boolean(input.directResult),
        compatibilityResultPresent: Boolean(compatibilityExecutionResult)
      }
    });
  }

  if (!input.directResult || !compatibilityExecutionResult) {
    return {
      kind: 'composition-shadow-graph-compatibility-parity',
      staging: true,
      matched: diagnostics.length === 0,
      diagnostics
    };
  }

  const directHasRuntimeErrors = hasNodalRuntimeErrors(input.directResult);
  const compatibilityHasRuntimeErrors = hasNodalRuntimeErrors(compatibilityExecutionResult);

  if (directHasRuntimeErrors !== compatibilityHasRuntimeErrors) {
    diagnostics.push({
      code: 'composition-compatibility-parity.runtime-error-presence-mismatch',
      kind: 'runtime-error',
      severity: 'error',
      message: 'Direct graph runtime and compatibility runtime disagree on error presence.',
      details: {
        directHasRuntimeErrors,
        compatibilityHasRuntimeErrors
      }
    });
  }

  if (!areStableValuesEqual(input.directResult.executionOrder, compatibilityExecutionResult.executionOrder)) {
    diagnostics.push({
      code: 'composition-compatibility-parity.execution-order-mismatch',
      kind: 'execution-order',
      severity: 'error',
      message: 'Direct graph runtime and compatibility runtime produced different execution orders.',
      details: {
        directExecutionOrder: input.directResult.executionOrder,
        compatibilityExecutionOrder: compatibilityExecutionResult.executionOrder
      }
    });
  }

  if (!areStableValuesEqual(input.directResult.outputsByNodeId, compatibilityExecutionResult.outputsByNodeId)) {
    diagnostics.push({
      code: 'composition-compatibility-parity.outputs-mismatch',
      kind: 'outputs',
      severity: 'error',
      message: 'Direct graph runtime and compatibility runtime produced different node outputs.',
      details: {
        directOutputsByNodeId: input.directResult.outputsByNodeId,
        compatibilityOutputsByNodeId: compatibilityExecutionResult.outputsByNodeId
      }
    });
  }

  const directPrimaryOutput = resolveNodalExecutionPrimaryOutputValue(input.directResult);
  const compatibilityPrimaryOutput = resolveNodalExecutionPrimaryOutputValue(compatibilityExecutionResult);

  if (!areStableValuesEqual(directPrimaryOutput, compatibilityPrimaryOutput)) {
    diagnostics.push({
      code: 'composition-compatibility-parity.primary-output-mismatch',
      kind: 'primary-output',
      severity: 'error',
      message: 'Direct graph runtime and compatibility runtime produced different primary outputs.',
      details: {
        directPrimaryOutput,
        compatibilityPrimaryOutput
      }
    });
  }

  return {
    kind: 'composition-shadow-graph-compatibility-parity',
    staging: true,
    matched: diagnostics.length === 0,
    diagnostics
  };
}

function hasNodalRuntimeErrors(result: NodalExecutionResult): boolean {
  if (!result.validation.valid || result.validation.issues.some((issue) => issue.severity === 'error')) {
    return true;
  }

  return result.graph.nodes.some((node) => node.state?.status === 'error' || node.state?.status === 'missing');
}

function areStableValuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeStableValue(value));
}

function normalizeStableValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeStableValue);
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, childValue]) => [key, normalizeStableValue(childValue)])
  );
}
