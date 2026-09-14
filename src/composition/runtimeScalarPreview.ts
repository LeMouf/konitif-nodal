import { findCompositionModule } from './helpers.js';
import type { Composition, Module } from './model.js';
import { executeCompositionScalarModule } from './runtimeScalarBridge.js';
import {
  resolveCompositionExecutionOrder,
  resolveCompositionModuleInputs,
  resolveCompositionOutputModules,
  type CompositionRuntimeDiagnostic,
  type CompositionRuntimeModuleState,
  type CompositionRuntimeOutputsByModuleId,
  type CompositionRuntimeSnapshot
} from './runtimeReadModel.js';
import { resolveNodalExecutionPrimaryOutputValue } from '../core/nodeSemantics.js';
import type { NodalExecutionResult } from '../types/model.js';

export type CompositionScalarPreviewGraphParityDiagnosticKind =
  | 'execution-order'
  | 'outputs'
  | 'primary-output'
  | 'runtime-diagnostics'
  | 'unsupported-module';

export interface CompositionScalarPreviewGraphParityDiagnostic {
  code: string;
  kind: CompositionScalarPreviewGraphParityDiagnosticKind;
  severity: 'error' | 'warning' | 'info';
  message: string;
  moduleId?: string;
  details?: Record<string, unknown>;
}

export interface CompositionScalarPreviewGraphParityResult {
  kind: 'composition-scalar-preview-graph-parity';
  staging: true;
  matched: boolean;
  previewSnapshot: CompositionRuntimeSnapshot;
  diagnostics: CompositionScalarPreviewGraphParityDiagnostic[];
}

export interface CompositionPreviewPrimaryOutput {
  moduleId: string | null;
  value: unknown;
  outputModuleIds: string[];
}

export function executeCompositionScalarRuntimePreview(composition: Composition): CompositionRuntimeSnapshot {
  const order = resolveCompositionExecutionOrder(composition);
  const outputsByModuleId: CompositionRuntimeOutputsByModuleId = {};
  const moduleStates: CompositionRuntimeModuleState[] = [];
  const diagnostics: CompositionRuntimeDiagnostic[] = [...order.diagnostics];

  for (const moduleId of order.executionOrder) {
    const module = findCompositionModule(composition, moduleId);

    if (!module) {
      const missingModuleDiagnostic: CompositionRuntimeDiagnostic = {
        code: 'composition-scalar-runtime-preview.missing-module',
        severity: 'error',
        message: `Execution order references missing module "${moduleId}".`,
        moduleId
      };

      diagnostics.push(missingModuleDiagnostic);
      moduleStates.push({
        moduleId,
        status: 'error',
        inputsByPortId: {},
        outputsByPortId: {},
        diagnostics: [missingModuleDiagnostic]
      });
      continue;
    }

    const inputs = resolveCompositionModuleInputs({
      composition,
      moduleId: module.id,
      outputsByModuleId
    });

    if (isGraphOutputBoundaryModule(module)) {
      const outputs = {
        value: normalizeScalarPreviewOutputBoundaryValue(inputs.inputsByPortId.value)
      };

      outputsByModuleId[module.id] = outputs;
      diagnostics.push(...inputs.diagnostics);
      moduleStates.push({
        moduleId: module.id,
        status: inputs.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : 'ready',
        inputsByPortId: inputs.inputsByPortId,
        outputsByPortId: outputs,
        diagnostics: inputs.diagnostics
      });
      continue;
    }

    const execution = executeCompositionScalarModule({
      module,
      resolvedInputs: inputs.inputsByPortId
    });
    const moduleDiagnostics = [
      ...inputs.diagnostics,
      ...execution.diagnostics.map((diagnostic): CompositionRuntimeDiagnostic => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        moduleId: diagnostic.moduleId,
        details: {
          moduleKind: diagnostic.moduleKind,
          ...diagnostic.details
        }
      }))
    ];
    const outputs = isSupportedScalarModule(module) ? execution.outputs : {};

    outputsByModuleId[module.id] = outputs;
    diagnostics.push(...moduleDiagnostics);
    moduleStates.push({
      moduleId: module.id,
      status: resolveModuleStateStatus(module, moduleDiagnostics),
      inputsByPortId: inputs.inputsByPortId,
      outputsByPortId: outputs,
      diagnostics: moduleDiagnostics
    });
  }

  return {
    compositionId: composition.id,
    compositionVersion: composition.version,
    executionOrder: order.executionOrder,
    moduleStates,
    outputsByModuleId,
    diagnostics
  };
}

export function resolveCompositionPreviewPrimaryOutput(input: {
  composition: Composition;
  previewSnapshot: CompositionRuntimeSnapshot | null;
}): CompositionPreviewPrimaryOutput {
  const outputModules = resolveCompositionOutputModules(input.composition);
  const primaryOutputModule = outputModules[0] ?? null;

  return {
    moduleId: primaryOutputModule?.id ?? null,
    value: primaryOutputModule && input.previewSnapshot
      ? input.previewSnapshot.outputsByModuleId[primaryOutputModule.id]?.value ?? null
      : null,
    outputModuleIds: outputModules.map((module) => module.id)
  };
}

function resolveModuleStateStatus(
  module: Module,
  diagnostics: CompositionRuntimeDiagnostic[]
): CompositionRuntimeModuleState['status'] {
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return 'error';
  }

  return isSupportedScalarModule(module) ? 'ready' : 'skipped';
}

function isSupportedScalarModule(module: Module): boolean {
  return module.kind === 'constant:number' || module.kind === 'math:add' || module.kind === 'math:multiply';
}

function isGraphOutputBoundaryModule(module: Module): boolean {
  return module.kind === 'graph:output';
}

function normalizeScalarPreviewOutputBoundaryValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareCompositionScalarPreviewWithGraphRuntime(input: {
  composition: Composition;
  graphResult: NodalExecutionResult | null;
  previewSnapshot?: CompositionRuntimeSnapshot;
}): CompositionScalarPreviewGraphParityResult {
  const previewSnapshot = input.previewSnapshot ?? executeCompositionScalarRuntimePreview(input.composition);
  const diagnostics: CompositionScalarPreviewGraphParityDiagnostic[] = [];

  if (!input.graphResult) {
    diagnostics.push({
      code: 'composition-scalar-preview-parity.graph-result-missing',
      kind: 'runtime-diagnostics',
      severity: 'error',
      message: 'Graph runtime did not provide an execution result.'
    });
  }

  for (const diagnostic of previewSnapshot.diagnostics) {
    if (diagnostic.code === 'composition-scalar-module.unsupported-kind') {
      diagnostics.push({
        code: 'composition-scalar-preview-parity.unsupported-module',
        kind: 'unsupported-module',
        severity: diagnostic.severity === 'error' ? 'error' : 'warning',
        message: diagnostic.message,
        moduleId: diagnostic.moduleId,
        details: diagnostic.details
      });
      continue;
    }

    diagnostics.push({
      code: 'composition-scalar-preview-parity.preview-diagnostics-present',
      kind: 'runtime-diagnostics',
      severity: diagnostic.severity,
      message: diagnostic.message,
      moduleId: diagnostic.moduleId,
      details: {
        code: diagnostic.code,
        connectionId: diagnostic.connectionId,
        portId: diagnostic.portId,
        ...diagnostic.details
      }
    });
  }

  if (input.graphResult && !input.graphResult.validation.valid) {
    diagnostics.push({
      code: 'composition-scalar-preview-parity.graph-validation-diagnostics-present',
      kind: 'runtime-diagnostics',
      severity: input.graphResult.validation.issues.some((issue) => issue.severity === 'error') ? 'error' : 'warning',
      message: 'Graph runtime reported validation diagnostics.',
      details: {
        issues: input.graphResult.validation.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          nodeId: issue.nodeId,
          edgeId: issue.edgeId
        }))
      }
    });
  }

  if (input.graphResult && !areStableValuesEqual(input.graphResult.executionOrder, previewSnapshot.executionOrder)) {
    diagnostics.push({
      code: 'composition-scalar-preview-parity.execution-order-mismatch',
      kind: 'execution-order',
      severity: 'error',
      message: 'Graph runtime and scalar Composition preview produced different execution orders.',
      details: {
        graphExecutionOrder: input.graphResult.executionOrder,
        compositionExecutionOrder: previewSnapshot.executionOrder
      }
    });
  }

  if (input.graphResult) {
    const graphOutputs = input.graphResult.outputsByNodeId;
    const previewOutputs = previewSnapshot.outputsByModuleId;

    if (!areStableValuesEqual(graphOutputs, previewOutputs)) {
      diagnostics.push({
        code: 'composition-scalar-preview-parity.outputs-mismatch',
        kind: 'outputs',
        severity: 'error',
        message: 'Graph runtime and scalar Composition preview produced different scalar outputs.',
        details: {
          graphOutputsByNodeId: graphOutputs,
          compositionOutputsByModuleId: previewOutputs
        }
      });
    }

    const graphPrimaryOutput = resolveNodalExecutionPrimaryOutputValue(input.graphResult);
    const previewPrimaryOutput = resolveCompositionPreviewPrimaryOutput({
      composition: input.composition,
      previewSnapshot
    });

    if (!areStableValuesEqual(graphPrimaryOutput, previewPrimaryOutput.value)) {
      diagnostics.push({
        code: 'composition-scalar-preview-parity.primary-output-mismatch',
        kind: 'primary-output',
        severity: 'error',
        message: 'Graph runtime and scalar Composition preview produced different primary outputs.',
        moduleId: previewPrimaryOutput.moduleId ?? undefined,
        details: {
          graphPrimaryOutput,
          compositionPrimaryOutput: previewPrimaryOutput.value,
          outputModuleIds: previewPrimaryOutput.outputModuleIds
        }
      });
    }
  }

  return {
    kind: 'composition-scalar-preview-graph-parity',
    staging: true,
    matched: diagnostics.every((diagnostic) => diagnostic.severity === 'info'),
    previewSnapshot,
    diagnostics
  };
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
