import { validateComposition } from './helpers.js';
import type {
  Composition,
  CompositionValidationIssue,
  CompositionValidationResult,
  Connection,
  Domain,
  Module
} from './model.js';

export type CompositionPatch =
  | AddModulePatch
  | UpdateModulePatch
  | RemoveModulePatch
  | AddConnectionPatch
  | RemoveConnectionPatch
  | UpdateProjectionMetadataPatch
  | AddDomainPatch
  | UpdateDomainPatch
  | RemoveDomainPatch;

export interface AddModulePatch {
  type: 'addModule';
  module: Module;
}

export interface UpdateModulePatch {
  type: 'updateModule';
  moduleId: string;
  patch: Partial<Omit<Module, 'id'>>;
}

export interface RemoveModulePatch {
  type: 'removeModule';
  moduleId: string;
  cascadeConnections?: boolean;
}

export interface AddConnectionPatch {
  type: 'addConnection';
  connection: Connection;
}

export interface RemoveConnectionPatch {
  type: 'removeConnection';
  connectionId: string;
}

export interface UpdateProjectionMetadataPatch {
  type: 'updateProjectionMetadata';
  projectionMetadata: Record<string, unknown>;
  replace?: boolean;
}

export interface AddDomainPatch {
  type: 'addDomain';
  domain: Domain;
}

export interface UpdateDomainPatch {
  type: 'updateDomain';
  domainId: string;
  patch: Partial<Omit<Domain, 'id'>>;
}

export interface RemoveDomainPatch {
  type: 'removeDomain';
  domainId: string;
}

export interface CompositionPatchResult {
  applied: boolean;
  composition: Composition;
  patch: CompositionPatch | null;
  validation: CompositionValidationResult;
}

export function createAddModulePatch(module: Module): AddModulePatch {
  return {
    type: 'addModule',
    module
  };
}

export function createAddConnectionPatch(connection: Connection): AddConnectionPatch {
  return {
    type: 'addConnection',
    connection
  };
}

export function createUpdateProjectionMetadataPatch(
  projectionMetadata: Record<string, unknown>,
  options: { replace?: boolean } = {}
): UpdateProjectionMetadataPatch {
  return {
    type: 'updateProjectionMetadata',
    projectionMetadata,
    replace: options.replace
  };
}

export function applyCompositionPatch(composition: Composition, patch: CompositionPatch): CompositionPatchResult {
  const preflightIssues = validatePatchPreconditions(composition, patch);

  if (preflightIssues.length > 0) {
    return createPatchResult(false, composition, patch, preflightIssues);
  }

  const nextComposition = applyUncheckedCompositionPatch(composition, patch);
  const validation = validateComposition(nextComposition);

  if (!validation.valid) {
    return {
      applied: false,
      composition,
      patch,
      validation
    };
  }

  return {
    applied: true,
    composition: nextComposition,
    patch,
    validation
  };
}

export function applyCompositionPatches(
  composition: Composition,
  patches: readonly CompositionPatch[]
): CompositionPatchResult {
  let currentComposition = composition;
  let lastPatch: CompositionPatch | null = null;

  for (const patch of patches) {
    const result = applyCompositionPatch(currentComposition, patch);

    if (!result.applied) {
      return result;
    }

    currentComposition = result.composition;
    lastPatch = patch;
  }

  return {
    applied: true,
    composition: currentComposition,
    patch: lastPatch,
    validation: validateComposition(currentComposition)
  };
}

function applyUncheckedCompositionPatch(composition: Composition, patch: CompositionPatch): Composition {
  switch (patch.type) {
    case 'addModule':
      return {
        ...composition,
        modules: [...composition.modules, structuredClone(patch.module)]
      };
    case 'updateModule':
      return {
        ...composition,
        modules: composition.modules.map((module) =>
          module.id === patch.moduleId
            ? {
                ...module,
                ...structuredClone(patch.patch),
                id: module.id
              }
            : module
        )
      };
    case 'removeModule':
      return {
        ...composition,
        modules: composition.modules.filter((module) => module.id !== patch.moduleId),
        connections: patch.cascadeConnections === false
          ? composition.connections
          : composition.connections.filter(
              (connection) =>
                connection.source.moduleId !== patch.moduleId &&
                connection.target.moduleId !== patch.moduleId
            ),
        domains: composition.domains.map((domain) => ({
          ...domain,
          moduleIds: domain.moduleIds.filter((moduleId) => moduleId !== patch.moduleId)
        }))
      };
    case 'addConnection':
      return {
        ...composition,
        connections: [...composition.connections, structuredClone(patch.connection)]
      };
    case 'removeConnection':
      return {
        ...composition,
        connections: composition.connections.filter((connection) => connection.id !== patch.connectionId)
      };
    case 'updateProjectionMetadata':
      return updateCompositionProjectionMetadata(composition, patch);
    case 'addDomain':
      return {
        ...composition,
        domains: [...composition.domains, structuredClone(patch.domain)]
      };
    case 'updateDomain':
      return {
        ...composition,
        domains: composition.domains.map((domain) =>
          domain.id === patch.domainId
            ? {
                ...domain,
                ...structuredClone(patch.patch),
                id: domain.id
              }
            : domain
        )
      };
    case 'removeDomain':
      return {
        ...composition,
        domains: composition.domains.filter((domain) => domain.id !== patch.domainId)
      };
  }
}

function updateCompositionProjectionMetadata(
  composition: Composition,
  patch: UpdateProjectionMetadataPatch
): Composition {
  const currentMetadata = composition.metadata ?? {};
  const currentProjectionMetadata = readRecord(currentMetadata.projectionMetadata);
  const nextProjectionMetadata = patch.replace
    ? structuredClone(patch.projectionMetadata)
    : {
        ...currentProjectionMetadata,
        ...structuredClone(patch.projectionMetadata)
      };

  return {
    ...composition,
    metadata: {
      ...currentMetadata,
      projectionMetadata: nextProjectionMetadata
    }
  };
}

function validatePatchPreconditions(
  composition: Composition,
  patch: CompositionPatch
): CompositionValidationIssue[] {
  switch (patch.type) {
    case 'addModule':
      return composition.modules.some((module) => module.id === patch.module.id)
        ? [createIssue('patch.module-exists', `Module "${patch.module.id}" already exists.`, { moduleId: patch.module.id })]
        : [];
    case 'updateModule':
      return composition.modules.some((module) => module.id === patch.moduleId)
        ? []
        : [createIssue('patch.missing-module', `Module "${patch.moduleId}" does not exist.`, { moduleId: patch.moduleId })];
    case 'removeModule': {
      const moduleExists = composition.modules.some((module) => module.id === patch.moduleId);

      if (!moduleExists) {
        return [createIssue('patch.missing-module', `Module "${patch.moduleId}" does not exist.`, { moduleId: patch.moduleId })];
      }

      const dependentConnections = composition.connections.filter(
        (connection) =>
          connection.source.moduleId === patch.moduleId ||
          connection.target.moduleId === patch.moduleId
      );

      if (patch.cascadeConnections === false && dependentConnections.length > 0) {
        return [
          createIssue(
            'patch.module-has-connections',
            `Module "${patch.moduleId}" still has dependent connections.`,
            { moduleId: patch.moduleId, connectionId: dependentConnections[0]?.id }
          )
        ];
      }

      return [];
    }
    case 'addConnection':
      return composition.connections.some((connection) => connection.id === patch.connection.id)
        ? [
            createIssue(
              'patch.connection-exists',
              `Connection "${patch.connection.id}" already exists.`,
              { connectionId: patch.connection.id }
            )
          ]
        : [];
    case 'removeConnection':
      return composition.connections.some((connection) => connection.id === patch.connectionId)
        ? []
        : [
            createIssue(
              'patch.missing-connection',
              `Connection "${patch.connectionId}" does not exist.`,
              { connectionId: patch.connectionId }
            )
          ];
    case 'updateProjectionMetadata':
      return [];
    case 'addDomain':
      return composition.domains.some((domain) => domain.id === patch.domain.id)
        ? [createIssue('patch.domain-exists', `Domain "${patch.domain.id}" already exists.`, { domainId: patch.domain.id })]
        : [];
    case 'updateDomain':
      return composition.domains.some((domain) => domain.id === patch.domainId)
        ? []
        : [createIssue('patch.missing-domain', `Domain "${patch.domainId}" does not exist.`, { domainId: patch.domainId })];
    case 'removeDomain':
      return composition.domains.some((domain) => domain.id === patch.domainId)
        ? []
        : [createIssue('patch.missing-domain', `Domain "${patch.domainId}" does not exist.`, { domainId: patch.domainId })];
  }
}

function createPatchResult(
  applied: boolean,
  composition: Composition,
  patch: CompositionPatch,
  issues: CompositionValidationIssue[]
): CompositionPatchResult {
  return {
    applied,
    composition,
    patch,
    validation: {
      valid: issues.every((issue) => issue.severity !== 'error'),
      issues
    }
  };
}

function createIssue(
  code: string,
  message: string,
  context: Partial<Pick<CompositionValidationIssue, 'moduleId' | 'portId' | 'connectionId' | 'domainId'>> = {}
): CompositionValidationIssue {
  return {
    id: `${code}:${context.connectionId ?? context.moduleId ?? context.portId ?? context.domainId ?? message}`,
    severity: 'error',
    code,
    message,
    ...context
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}
