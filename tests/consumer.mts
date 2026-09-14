import {
  createNodalGraphDocument,
  executeGraphDocument,
  mathDialect,
  validateGraphDocument,
  type NodalExecutionResult,
  type NodalGraphDocument,
} from '@konitif/nodal';

const graph: NodalGraphDocument = createNodalGraphDocument({ dialect: mathDialect.id });
validateGraphDocument(graph, mathDialect);
const result: NodalExecutionResult = executeGraphDocument(graph, mathDialect);
void result;
