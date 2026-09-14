import { findCompositionModule, findCompositionPort } from './helpers.js';
import type { Composition, CompositionValidationResult, Module } from './model.js';

export type CompositionRuntimeDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface CompositionRuntimeDiagnostic {
  code: string;
  severity: CompositionRuntimeDiagnosticSeverity;
  message: string;
  moduleId?: string;
  portId?: string;
  connectionId?: string;
  details?: Record<string, unknown>;
}

export type CompositionRuntimeOutputsByPortId = Record<string, unknown>;
export type CompositionRuntimeOutputsByModuleId = Record<string, CompositionRuntimeOutputsByPortId>;

export interface CompositionRuntimeModuleState {
  moduleId: string;
  status: 'pending' | 'ready' | 'skipped' | 'error';
  inputsByPortId: Record<string, unknown>;
  outputsByPortId: CompositionRuntimeOutputsByPortId;
  diagnostics: CompositionRuntimeDiagnostic[];
}

export interface CompositionRuntimeSnapshot {
  compositionId: string;
  compositionVersion: Composition['version'];
  executionOrder: string[];
  moduleStates: CompositionRuntimeModuleState[];
  outputsByModuleId: CompositionRuntimeOutputsByModuleId;
  diagnostics: CompositionRuntimeDiagnostic[];
  validation?: CompositionValidationResult;
}

export interface CompositionExecutionOrderResult {
  executionOrder: string[];
  diagnostics: CompositionRuntimeDiagnostic[];
}

export interface CompositionModuleInputsResult {
  moduleId: string;
  inputsByPortId: Record<string, unknown>;
  diagnostics: CompositionRuntimeDiagnostic[];
}

export function resolveCompositionExecutionOrder(composition: Composition): CompositionExecutionOrderResult {
  const moduleIds = new Set(composition.modules.map((module) => module.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const diagnostics: CompositionRuntimeDiagnostic[] = [];

  for (const module of composition.modules) {
    inDegree.set(module.id, 0);
    adjacency.set(module.id, []);
  }

  for (const connection of composition.connections) {
    const sourceExists = moduleIds.has(connection.source.moduleId);
    const targetExists = moduleIds.has(connection.target.moduleId);

    if (!sourceExists) {
      diagnostics.push({
        code: 'composition-runtime.missing-source-module',
        severity: 'error',
        message: `Connection "${connection.id}" references missing source module "${connection.source.moduleId}".`,
        moduleId: connection.source.moduleId,
        connectionId: connection.id
      });
    }

    if (!targetExists) {
      diagnostics.push({
        code: 'composition-runtime.missing-target-module',
        severity: 'error',
        message: `Connection "${connection.id}" references missing target module "${connection.target.moduleId}".`,
        moduleId: connection.target.moduleId,
        connectionId: connection.id
      });
    }

    if (!sourceExists || !targetExists) {
      continue;
    }

    adjacency.get(connection.source.moduleId)?.push(connection.target.moduleId);
    inDegree.set(connection.target.moduleId, (inDegree.get(connection.target.moduleId) ?? 0) + 1);
  }

  const queue = composition.modules
    .filter((module) => (inDegree.get(module.id) ?? 0) === 0)
    .map((module) => module.id);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const moduleId = queue.shift();

    if (!moduleId) {
      break;
    }

    ordered.push(moduleId);

    for (const nextModuleId of adjacency.get(moduleId) ?? []) {
      const nextInDegree = (inDegree.get(nextModuleId) ?? 0) - 1;
      inDegree.set(nextModuleId, nextInDegree);

      if (nextInDegree === 0) {
        queue.push(nextModuleId);
      }
    }
  }

  if (ordered.length !== composition.modules.length) {
    diagnostics.push({
      code: 'composition-runtime.unresolved-execution-order',
      severity: 'warning',
      message: 'Composition execution order could not be fully resolved; falling back to module declaration order.',
      details: {
        orderedCount: ordered.length,
        moduleCount: composition.modules.length
      }
    });

    return {
      executionOrder: composition.modules.map((module) => module.id),
      diagnostics
    };
  }

  return {
    executionOrder: ordered,
    diagnostics
  };
}

export function resolveCompositionModuleInputs(input: {
  composition: Composition;
  moduleId: string;
  outputsByModuleId: CompositionRuntimeOutputsByModuleId;
}): CompositionModuleInputsResult {
  const module = findCompositionModule(input.composition, input.moduleId);
  const inputsByPortId: Record<string, unknown> = {};
  const diagnostics: CompositionRuntimeDiagnostic[] = [];

  if (!module) {
    return {
      moduleId: input.moduleId,
      inputsByPortId,
      diagnostics: [
        {
          code: 'composition-runtime.missing-module',
          severity: 'error',
          message: `Module "${input.moduleId}" does not exist in the Composition.`,
          moduleId: input.moduleId
        }
      ]
    };
  }

  for (const targetPort of module.ports.filter((port) => port.direction === 'input')) {
    const incomingConnections = input.composition.connections.filter(
      (connection) => connection.target.moduleId === module.id && connection.target.portId === targetPort.id
    );
    const incomingConnection = incomingConnections[0];

    if (!incomingConnection) {
      continue;
    }

    if (incomingConnections.length > 1) {
      diagnostics.push({
        code: 'composition-runtime.multiple-input-connections',
        severity: 'warning',
        message: `Input port "${module.id}.${targetPort.id}" has multiple incoming connections; the first declared connection is used by the staging read model.`,
        moduleId: module.id,
        portId: targetPort.id,
        connectionId: incomingConnection.id,
        details: {
          connectionIds: incomingConnections.map((connection) => connection.id)
        }
      });
    }

    const sourceModule = findCompositionModule(input.composition, incomingConnection.source.moduleId);
    const sourcePort = findCompositionPort(input.composition, incomingConnection.source);

    if (!sourceModule) {
      diagnostics.push({
        code: 'composition-runtime.missing-source-module',
        severity: 'error',
        message: `Connection "${incomingConnection.id}" references missing source module "${incomingConnection.source.moduleId}".`,
        moduleId: incomingConnection.source.moduleId,
        connectionId: incomingConnection.id
      });
      continue;
    }

    if (!sourcePort) {
      diagnostics.push({
        code: 'composition-runtime.missing-source-port',
        severity: 'error',
        message: `Connection "${incomingConnection.id}" references missing source port "${incomingConnection.source.portId}".`,
        moduleId: incomingConnection.source.moduleId,
        portId: incomingConnection.source.portId,
        connectionId: incomingConnection.id
      });
      continue;
    }

    inputsByPortId[targetPort.id] = input.outputsByModuleId[incomingConnection.source.moduleId]?.[
      incomingConnection.source.portId
    ];

    if (!Object.prototype.hasOwnProperty.call(input.outputsByModuleId, incomingConnection.source.moduleId)) {
      diagnostics.push({
        code: 'composition-runtime.missing-source-outputs',
        severity: 'warning',
        message: `Source module "${incomingConnection.source.moduleId}" has no resolved outputs yet.`,
        moduleId: incomingConnection.source.moduleId,
        portId: incomingConnection.source.portId,
        connectionId: incomingConnection.id
      });
    }
  }

  return {
    moduleId: module.id,
    inputsByPortId,
    diagnostics
  };
}

export function resolveCompositionOutputModules(composition: Composition): Module[] {
  return composition.modules.filter(isGraphOutputCompatibleModule);
}

export function resolveCompositionOutputModuleIds(composition: Composition): string[] {
  return resolveCompositionOutputModules(composition).map((module) => module.id);
}

function isGraphOutputCompatibleModule(module: Module): boolean {
  return module.kind === 'graph:output';
}
