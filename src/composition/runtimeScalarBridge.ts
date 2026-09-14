import {
  executeScalarAdd,
  executeScalarConstantNumber,
  executeScalarMultiply,
  type ScalarExecutorContext
} from '../runtime/scalarMathExecutors.js';
import type { Module } from './model.js';

export type CompositionScalarModuleDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface CompositionScalarModuleDiagnostic {
  code: string;
  severity: CompositionScalarModuleDiagnosticSeverity;
  message: string;
  moduleId?: string;
  moduleKind?: string;
  details?: Record<string, unknown>;
}

export interface CompositionScalarModuleExecutionResult {
  kind: 'composition-scalar-module-execution';
  staging: true;
  moduleId: string;
  moduleKind: string;
  outputs: Record<string, unknown>;
  diagnostics: CompositionScalarModuleDiagnostic[];
}

export function executeCompositionScalarModule(input: {
  module: Module;
  resolvedInputs: Record<string, unknown>;
}): CompositionScalarModuleExecutionResult {
  const context = createScalarExecutorContext(input.module, input.resolvedInputs);

  switch (input.module.kind) {
    case 'constant:number':
      return createCompositionScalarModuleResult({
        module: input.module,
        outputs: executeScalarConstantNumber(context).outputs
      });

    case 'math:add':
      return createCompositionScalarModuleResult({
        module: input.module,
        outputs: executeScalarAdd(context).outputs
      });

    case 'math:multiply':
      return createCompositionScalarModuleResult({
        module: input.module,
        outputs: executeScalarMultiply(context).outputs
      });

    default:
      return createCompositionScalarModuleResult({
        module: input.module,
        outputs: {},
        diagnostics: [
          {
            code: 'composition-scalar-module.unsupported-kind',
            severity: 'warning',
            message: `Composition scalar bridge does not support module kind "${input.module.kind}".`,
            moduleId: input.module.id,
            moduleKind: input.module.kind
          }
        ]
      });
  }
}

function createScalarExecutorContext(
  module: Module,
  resolvedInputs: Record<string, unknown>
): ScalarExecutorContext {
  return {
    moduleId: module.id,
    config: resolveModuleConfig(module),
    resolvedInputs
  };
}

function resolveModuleConfig(module: Module): Record<string, unknown> {
  const config = module.metadata?.config;

  return isPlainObject(config) ? config : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createCompositionScalarModuleResult(input: {
  module: Module;
  outputs: Record<string, unknown>;
  diagnostics?: CompositionScalarModuleDiagnostic[];
}): CompositionScalarModuleExecutionResult {
  return {
    kind: 'composition-scalar-module-execution',
    staging: true,
    moduleId: input.module.id,
    moduleKind: input.module.kind,
    outputs: input.outputs,
    diagnostics: input.diagnostics ?? []
  };
}
