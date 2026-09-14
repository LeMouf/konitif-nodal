import {
  createNodalGraphDocument,
  executeGraphDocument,
  mathDialect,
  mathDialectContributions,
  NodalDialectRegistry,
  registerNodalDialectContributions,
  validateGraphDocument,
  type NodalExecutionResult,
  type NodalGraphDocument,
} from '@konitif/nodal';

const graph: NodalGraphDocument = createNodalGraphDocument({ dialect: mathDialect.id });
validateGraphDocument(graph, mathDialect);
const result: NodalExecutionResult = executeGraphDocument(graph, mathDialect);
void result;

const registry = new NodalDialectRegistry();
registerNodalDialectContributions(registry, mathDialectContributions);
registry.activate();
void registry.resolve('math');
