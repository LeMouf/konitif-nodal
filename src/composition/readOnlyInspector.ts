import { validateComposition } from './helpers.js';
import type {
  Composition,
  CompositionValidationIssue,
  CompositionValidationResult
} from './model.js';
import { nodalGraphToWorkflow } from './adapters/nodalGraphAdapter.js';
import type { NodalGraphDocument } from '../types/model.js';

export interface CompositionReadOnlySummary {
  modulesCount: number;
  connectionsCount: number;
  domainsCount: number;
  validation: CompositionValidationResult;
  invalidConnections: CompositionValidationIssue[];
  graphIsProjection: true;
  projectionMetadataSeparated: boolean;
}

export function getCompositionFromNodalGraph(graph: NodalGraphDocument): Composition {
  return nodalGraphToWorkflow(graph).composition;
}

export function getCompositionReadOnlySummary(composition: Composition): CompositionReadOnlySummary {
  const validation = validateComposition(composition);

  return {
    modulesCount: composition.modules.length,
    connectionsCount: composition.connections.length,
    domainsCount: composition.domains.length,
    validation,
    invalidConnections: validation.issues.filter(isConnectionIssue),
    graphIsProjection: true,
    projectionMetadataSeparated: isProjectionMetadataSeparated(composition)
  };
}

export function getNodalGraphCompositionSummary(graph: NodalGraphDocument): CompositionReadOnlySummary {
  return getCompositionReadOnlySummary(getCompositionFromNodalGraph(graph));
}

function isConnectionIssue(issue: CompositionValidationIssue): boolean {
  return (
    typeof issue.connectionId === 'string' ||
    issue.code.startsWith('connection.') ||
    issue.code.startsWith('port.')
  );
}

function isProjectionMetadataSeparated(composition: Composition): boolean {
  return composition.modules.every((module) => !hasProjectionMetadata(module.metadata));
}

function hasProjectionMetadata(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'projectionMetadata' in value
  );
}
