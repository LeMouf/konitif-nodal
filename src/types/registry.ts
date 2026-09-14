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

export interface NodalDialect {
  id: string;
  title: string;
  nodeRegistry: NodalNodeDefinition[];
  validate?: (graph: NodalGraphDocument) => NodalValidationResult;
}
