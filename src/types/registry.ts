import type {
  NodalGraphDocument,
  NodalGraphNode,
  NodalGraphPort,
  NodalRuntimeNodeResult,
  NodalValidationResult
} from './model.js';

export interface NodalNodeDefinitionPortTemplate {
  id: string;
  label: string;
  dataType: NodalGraphPort['dataType'];
  mode: NodalGraphPort['mode'];
}

export interface NodalNodeDefinition {
  type: string;
  title: string;
  description: string;
  inputs: NodalNodeDefinitionPortTemplate[];
  outputs: NodalNodeDefinitionPortTemplate[];
  defaultConfig: Record<string, unknown>;
  execute?: (context: {
    node: NodalGraphNode;
    resolvedInputs: Record<string, unknown>;
    graph: NodalGraphDocument;
  }) => NodalRuntimeNodeResult;
}

export type NodalNodeSchemaDefinition = Omit<NodalNodeDefinition, 'execute'>;
export type NodalNodeExecutor = NonNullable<NodalNodeDefinition['execute']>;

export interface NodalDialectSchema {
  id: string;
  title: string;
  nodeRegistry: NodalNodeSchemaDefinition[];
}

export interface NodalDialectAdmission {
  dialectId: string;
  validate: (graph: NodalGraphDocument) => NodalValidationResult;
}

export interface NodalNodeExecutionBinding {
  nodeType: string;
  execute: NodalNodeExecutor;
}

export interface NodalDialectExecution {
  dialectId: string;
  bindings: NodalNodeExecutionBinding[];
}

export interface NodalDialectRuntime {
  schema: NodalDialectSchema;
  admission: NodalDialectAdmission | null;
  execution: NodalDialectExecution;
}

export interface NodalDialect {
  id: string;
  title: string;
  nodeRegistry: NodalNodeDefinition[];
  validate?: (graph: NodalGraphDocument) => NodalValidationResult;
}
