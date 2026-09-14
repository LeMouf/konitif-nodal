import type { NodalGraphDocument } from '../types/model.js';

export interface NodalGraphCommitOptions {
  affectsRuntime?: boolean;
}

export interface NodalGraphCommitDiagnostic {
  code: 'commit.hook-error';
  severity: 'warning';
  message: string;
}

export type NodalGraphCommittedHook = (
  previousGraph: NodalGraphDocument,
  nextGraph: NodalGraphDocument,
  options: NodalGraphCommitOptions
) => void;

export interface CommitNodalGraphEditInput {
  previousGraph: NodalGraphDocument;
  nextGraph: NodalGraphDocument;
  options?: NodalGraphCommitOptions;
  onGraphCommitted?: NodalGraphCommittedHook;
}

export interface NodalGraphCommitResult {
  previousGraph: NodalGraphDocument;
  nextGraph: NodalGraphDocument;
  options: NodalGraphCommitOptions;
  diagnostics: NodalGraphCommitDiagnostic[];
}

export function commitNodalGraphEdit(input: CommitNodalGraphEditInput): NodalGraphCommitResult {
  const options = { ...(input.options ?? {}) };
  const diagnostics: NodalGraphCommitDiagnostic[] = [];

  if (input.onGraphCommitted) {
    try {
      input.onGraphCommitted(
        structuredClone(input.previousGraph),
        structuredClone(input.nextGraph),
        { ...options }
      );
    } catch (error) {
      diagnostics.push({
        code: 'commit.hook-error',
        severity: 'warning',
        message: resolveCommitHookErrorMessage(error)
      });
    }
  }

  return {
    previousGraph: input.previousGraph,
    nextGraph: input.nextGraph,
    options,
    diagnostics
  };
}

function resolveCommitHookErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? `Graph commit hook failed without blocking the graph edit: ${error.message}`
    : 'Graph commit hook failed without blocking the graph edit.';
}
