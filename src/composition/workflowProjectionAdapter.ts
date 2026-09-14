import {
  commitWorkflowComposition,
  type CompositionValidationResult,
  type Workflow
} from '@konitif/composition';
import { executeGraphDocument } from '../runtime/executeGraph.js';
import type { NodalExecutionResult, NodalGraphDocument } from '../types/model.js';
import type { NodalDialect } from '../types/registry.js';
import { nodalGraphToWorkflow, workflowToNodalGraph } from './adapters/nodalGraphAdapter.js';

export interface NodalGraphProjectionCommitResult {
  accepted: boolean;
  workflow: Workflow;
  graph: NodalGraphDocument;
  validation: CompositionValidationResult;
}

export interface NodalWorkflowRuntimeAdapterResult {
  authority: 'workflow-composition';
  adapter: 'nodal-runtime';
  workflowId: string;
  compositionId: string;
  graphProjection: NodalGraphDocument;
  runtimeResult: NodalExecutionResult;
}

export function createWorkflowFromNodalGraph(graph: NodalGraphDocument): Workflow {
  return nodalGraphToWorkflow(graph);
}

export function projectWorkflowToNodalGraph(workflow: Workflow): NodalGraphDocument {
  return workflowToNodalGraph(workflow);
}

export function commitNodalGraphProjection(input: {
  workflow: Workflow;
  nextGraph: NodalGraphDocument;
  affectsRuntime?: boolean;
}): NodalGraphProjectionCommitResult {
  const projectedWorkflow = nodalGraphToWorkflow(input.nextGraph);
  const candidateWorkflow = input.affectsRuntime === false
    ? {
        ...input.workflow,
        title: projectedWorkflow.title,
        asset: {
          ...input.workflow.asset,
          title: projectedWorkflow.asset.title
        },
        metadata: projectedWorkflow.metadata
      }
    : {
        ...projectedWorkflow,
        id: input.workflow.id,
        composition: {
          ...projectedWorkflow.composition,
          id: input.workflow.composition.id
        }
      };
  const commit = commitWorkflowComposition(input.workflow, candidateWorkflow);

  return {
    accepted: commit.accepted,
    workflow: commit.workflow,
    graph: workflowToNodalGraph(commit.workflow),
    validation: commit.validation
  };
}

export function executeWorkflowViaNodalRuntime(input: {
  workflow: Workflow;
  dialect: NodalDialect;
}): NodalWorkflowRuntimeAdapterResult {
  const graphProjection = workflowToNodalGraph(input.workflow);
  const runtimeResult = executeGraphDocument(graphProjection, input.dialect);

  return {
    authority: 'workflow-composition',
    adapter: 'nodal-runtime',
    workflowId: input.workflow.id,
    compositionId: input.workflow.composition.id,
    graphProjection,
    runtimeResult
  };
}
