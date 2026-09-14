import type {
  Composition,
  Connection
} from '@konitif/composition';
import type {
  CompositionRuntimeDiagnostic,
  CompositionRuntimeModuleState,
  CompositionRuntimeOutputsByModuleId,
  CompositionRuntimeSnapshot
} from './runtimeReadModel.js';

export type ExecutionArcRunStatus = 'created' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecutionArcModuleStatus = 'created' | 'queued' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';
export type ExecutionArcConnectionStatus = 'pending' | 'propagated' | 'blocked' | 'invalid';
export type ExecutionArcOutputBoundaryStatus = 'absent' | 'available' | 'missing-input';
export type ExecutionArcDiagnosticSeverity = CompositionRuntimeDiagnostic['severity'];

export type ExecutionArcEventKind =
  | 'RunCreated'
  | 'RunStarted'
  | 'ModuleQueued'
  | 'ModuleStarted'
  | 'ModuleCompleted'
  | 'ModuleFailed'
  | 'ModuleSkipped'
  | 'ConnectionPropagated'
  | 'ConnectionBlocked'
  | 'ConnectionInvalid'
  | 'ConnectionPending'
  | 'OutputBoundaryResolved'
  | 'OutputBoundaryMissing'
  | 'OutputProduced'
  | 'DiagnosticEmitted'
  | 'RunCompleted'
  | 'RunFailed';

export interface ExecutionArcDiagnostic {
  id: string;
  code: string;
  severity: ExecutionArcDiagnosticSeverity;
  message: string;
  moduleId?: string;
  portId?: string;
  connectionId?: string;
  details?: Record<string, unknown>;
}

export interface ExecutionArcEvent {
  id: string;
  sequence: number;
  kind: ExecutionArcEventKind;
  timestamp: string | null;
  timestampGenerated: false;
  moduleId?: string;
  portId?: string;
  connectionId?: string;
  diagnosticId?: string;
  payload?: Record<string, unknown>;
}

export interface ExecutionArcRunState {
  runId: string;
  status: ExecutionArcRunStatus;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  diagnostics: ExecutionArcDiagnostic[];
}

export interface ExecutionArcModuleState {
  moduleId: string;
  status: ExecutionArcModuleStatus;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  inputsByPortId: Record<string, unknown>;
  outputsByPortId: Record<string, unknown>;
  diagnostics: ExecutionArcDiagnostic[];
}

export interface ExecutionArcConnectionEndpoint {
  moduleId: string;
  portId: string;
}

export interface ExecutionArcConnectionState {
  connectionId: string;
  source: ExecutionArcConnectionEndpoint;
  target: ExecutionArcConnectionEndpoint;
  status: ExecutionArcConnectionStatus;
  diagnostics: ExecutionArcDiagnostic[];
}

export interface ExecutionArcOutputBoundaryState {
  moduleId: string;
  value: unknown;
  primary: boolean;
  status: ExecutionArcOutputBoundaryStatus;
}

export interface ExecutionArcPrimaryOutputState {
  moduleId: string | null;
  value: unknown;
  status: ExecutionArcOutputBoundaryStatus;
}

export interface ExecutionArcSnapshot {
  kind: 'execution-arc';
  staging: true;
  run: ExecutionArcRunState;
  compositionId: string;
  compositionVersion: CompositionRuntimeSnapshot['compositionVersion'];
  executionOrder: string[];
  modules: ExecutionArcModuleState[];
  connections: ExecutionArcConnectionState[];
  outputModules: ExecutionArcOutputBoundaryState[];
  primaryOutput: ExecutionArcPrimaryOutputState | null;
  outputsByModuleId: CompositionRuntimeOutputsByModuleId;
  diagnostics: ExecutionArcDiagnostic[];
  events: ExecutionArcEvent[];
}

export function createExecutionArcFromCompositionRuntimeSnapshot(
  snapshot: CompositionRuntimeSnapshot,
  options: { composition?: Composition | null } = {}
): ExecutionArcSnapshot {
  const diagnostics = normalizeExecutionArcDiagnostics(snapshot.diagnostics);
  const modules = snapshot.moduleStates.map((moduleState) => createExecutionArcModuleState(moduleState));
  const connections = options.composition
    ? createExecutionArcConnectionStates({
        composition: options.composition,
        moduleStates: snapshot.moduleStates,
        outputsByModuleId: snapshot.outputsByModuleId,
        diagnostics
      })
    : [];
  const outputModules = options.composition
    ? createExecutionArcOutputBoundaryStates({
        composition: options.composition,
        outputsByModuleId: snapshot.outputsByModuleId
      })
    : [];
  const primaryOutput = outputModules[0]
    ? {
        moduleId: outputModules[0].moduleId,
        value: outputModules[0].value,
        status: outputModules[0].status
      }
    : null;
  const runId = createExecutionArcRunId(snapshot);
  const events = createExecutionArcEvents({
    runId,
    moduleStates: snapshot.moduleStates,
    connections,
    outputModules,
    diagnostics,
    outputsByModuleId: snapshot.outputsByModuleId
  });
  const run: ExecutionArcRunState = {
    runId,
    status: resolveExecutionArcRunStatus({ diagnostics, modules }),
    createdAt: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    diagnostics
  };

  return {
    kind: 'execution-arc',
    staging: true,
    run,
    compositionId: snapshot.compositionId,
    compositionVersion: snapshot.compositionVersion,
    executionOrder: [...snapshot.executionOrder],
    modules,
    connections,
    outputModules,
    primaryOutput,
    outputsByModuleId: cloneOutputsByModuleId(snapshot.outputsByModuleId),
    diagnostics,
    events
  };
}

function createExecutionArcRunId(snapshot: CompositionRuntimeSnapshot): string {
  return `execution-arc:${snapshot.compositionId}:v${snapshot.compositionVersion}`;
}

function createExecutionArcModuleState(moduleState: CompositionRuntimeModuleState): ExecutionArcModuleState {
  const diagnostics = normalizeExecutionArcDiagnostics(moduleState.diagnostics);

  return {
    moduleId: moduleState.moduleId,
    status: mapCompositionModuleStatus(moduleState.status),
    queuedAt: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    inputsByPortId: { ...moduleState.inputsByPortId },
    outputsByPortId: { ...moduleState.outputsByPortId },
    diagnostics
  };
}

function mapCompositionModuleStatus(status: CompositionRuntimeModuleState['status']): ExecutionArcModuleStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'ready':
      return 'completed';
    case 'error':
      return 'failed';
    case 'skipped':
      return 'skipped';
    default:
      return 'created';
  }
}

function resolveExecutionArcRunStatus(input: {
  diagnostics: readonly ExecutionArcDiagnostic[];
  modules: readonly ExecutionArcModuleState[];
}): ExecutionArcRunStatus {
  if (
    input.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ||
    input.modules.some((module) => module.status === 'failed')
  ) {
    return 'failed';
  }

  return 'completed';
}

function normalizeExecutionArcDiagnostics(
  diagnostics: readonly CompositionRuntimeDiagnostic[]
): ExecutionArcDiagnostic[] {
  return diagnostics.map((diagnostic, index) => ({
    id: `diagnostic:${index + 1}:${diagnostic.code}`,
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    moduleId: diagnostic.moduleId,
    portId: diagnostic.portId,
    connectionId: diagnostic.connectionId,
    details: diagnostic.details ? { ...diagnostic.details } : undefined
  }));
}

function createExecutionArcOutputBoundaryStates(input: {
  composition: Composition;
  outputsByModuleId: CompositionRuntimeOutputsByModuleId;
}): ExecutionArcOutputBoundaryState[] {
  const outputModules = input.composition.modules.filter((module) => module.kind === 'graph:output');

  return outputModules.map((module, index) => {
    const hasValue = Object.prototype.hasOwnProperty.call(input.outputsByModuleId[module.id] ?? {}, 'value');
    const value = hasValue ? input.outputsByModuleId[module.id]?.value : null;

    return {
      moduleId: module.id,
      value,
      primary: index === 0,
      status: hasValue ? 'available' : 'missing-input'
    };
  });
}

function createExecutionArcConnectionStates(input: {
  composition: Composition;
  moduleStates: readonly CompositionRuntimeModuleState[];
  outputsByModuleId: CompositionRuntimeOutputsByModuleId;
  diagnostics: readonly ExecutionArcDiagnostic[];
}): ExecutionArcConnectionState[] {
  const moduleStateById = new Map(input.moduleStates.map((moduleState) => [moduleState.moduleId, moduleState]));

  return input.composition.connections.map((connection) => {
    const diagnostics = input.diagnostics.filter((diagnostic) => diagnostic.connectionId === connection.id);

    return {
      connectionId: connection.id,
      source: { ...connection.source },
      target: { ...connection.target },
      status: resolveExecutionArcConnectionStatus({
        connection,
        sourceModuleState: moduleStateById.get(connection.source.moduleId) ?? null,
        outputsByModuleId: input.outputsByModuleId,
        diagnostics
      }),
      diagnostics
    };
  });
}

function resolveExecutionArcConnectionStatus(input: {
  connection: Connection;
  sourceModuleState: CompositionRuntimeModuleState | null;
  outputsByModuleId: CompositionRuntimeOutputsByModuleId;
  diagnostics: readonly ExecutionArcDiagnostic[];
}): ExecutionArcConnectionStatus {
  if (input.diagnostics.some(isInvalidConnectionDiagnostic)) {
    return 'invalid';
  }

  const sourceOutputs = input.outputsByModuleId[input.connection.source.moduleId];

  if (
    sourceOutputs &&
    Object.prototype.hasOwnProperty.call(sourceOutputs, input.connection.source.portId)
  ) {
    return 'propagated';
  }

  if (sourceOutputs || input.sourceModuleState) {
    return 'blocked';
  }

  return 'pending';
}

function isInvalidConnectionDiagnostic(diagnostic: ExecutionArcDiagnostic): boolean {
  return (
    diagnostic.code.includes('missing-source') ||
    diagnostic.code.includes('missing-target')
  );
}

function createExecutionArcEvents(input: {
  runId: string;
  moduleStates: readonly CompositionRuntimeModuleState[];
  connections: readonly ExecutionArcConnectionState[];
  outputModules: readonly ExecutionArcOutputBoundaryState[];
  diagnostics: readonly ExecutionArcDiagnostic[];
  outputsByModuleId: CompositionRuntimeOutputsByModuleId;
}): ExecutionArcEvent[] {
  const events: ExecutionArcEvent[] = [];

  pushEvent(events, {
    kind: 'RunCreated',
    payload: { runId: input.runId }
  });
  pushEvent(events, {
    kind: 'RunStarted',
    payload: { runId: input.runId }
  });

  for (const moduleState of input.moduleStates) {
    pushEvent(events, {
      kind: 'ModuleQueued',
      moduleId: moduleState.moduleId
    });

    if (moduleState.status === 'skipped') {
      pushEvent(events, {
        kind: 'ModuleSkipped',
        moduleId: moduleState.moduleId
      });
    } else if (moduleState.status === 'error') {
      pushEvent(events, {
        kind: 'ModuleFailed',
        moduleId: moduleState.moduleId
      });
    } else {
      pushEvent(events, {
        kind: 'ModuleStarted',
        moduleId: moduleState.moduleId
      });
      pushEvent(events, {
        kind: 'ModuleCompleted',
        moduleId: moduleState.moduleId
      });
    }

    for (const [portId, value] of Object.entries(input.outputsByModuleId[moduleState.moduleId] ?? {})) {
      pushEvent(events, {
        kind: 'OutputProduced',
        moduleId: moduleState.moduleId,
        portId,
        payload: { value }
      });
    }
  }

  for (const connection of input.connections) {
    pushEvent(events, {
      kind: mapConnectionStatusToEventKind(connection.status),
      connectionId: connection.connectionId,
      payload: {
        source: connection.source,
        target: connection.target,
        status: connection.status
      }
    });
  }

  for (const outputModule of input.outputModules) {
    pushEvent(events, {
      kind: outputModule.status === 'available' ? 'OutputBoundaryResolved' : 'OutputBoundaryMissing',
      moduleId: outputModule.moduleId,
      payload: {
        primary: outputModule.primary,
        status: outputModule.status,
        value: outputModule.value
      }
    });
  }

  for (const diagnostic of input.diagnostics) {
    pushEvent(events, {
      kind: 'DiagnosticEmitted',
      moduleId: diagnostic.moduleId,
      portId: diagnostic.portId,
      connectionId: diagnostic.connectionId,
      diagnosticId: diagnostic.id,
      payload: {
        code: diagnostic.code,
        severity: diagnostic.severity
      }
    });
  }

  pushEvent(events, {
    kind: input.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'RunFailed' : 'RunCompleted',
    payload: { runId: input.runId }
  });

  return events;
}

function mapConnectionStatusToEventKind(status: ExecutionArcConnectionStatus): ExecutionArcEventKind {
  switch (status) {
    case 'propagated':
      return 'ConnectionPropagated';
    case 'blocked':
      return 'ConnectionBlocked';
    case 'invalid':
      return 'ConnectionInvalid';
    case 'pending':
    default:
      return 'ConnectionPending';
  }
}

function pushEvent(
  events: ExecutionArcEvent[],
  event: Omit<ExecutionArcEvent, 'id' | 'sequence' | 'timestamp' | 'timestampGenerated'>
): void {
  const sequence = events.length + 1;

  events.push({
    id: `event:${sequence}:${event.kind}`,
    sequence,
    timestamp: null,
    timestampGenerated: false,
    ...event
  });
}

function cloneOutputsByModuleId(outputsByModuleId: CompositionRuntimeOutputsByModuleId): CompositionRuntimeOutputsByModuleId {
  return Object.fromEntries(
    Object.entries(outputsByModuleId).map(([moduleId, outputsByPortId]) => [
      moduleId,
      { ...outputsByPortId }
    ])
  );
}
