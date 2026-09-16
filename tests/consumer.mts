import {
  createNodalGraphDocument,
  executeGraphDocument,
  mathDialect,
  mathDialectContributions,
  NodalDialectRegistry,
  registerNodalDialectContributions,
  validateGraphDocument,
  worldToScreenPoint,
  screenToWorldPoint,
  getNodalConnectorKey,
  type NodalExecutionResult,
  type NodalGraphDocument,
} from '@konitif/nodal';

const graph: NodalGraphDocument = createNodalGraphDocument({ dialect: mathDialect.id });
const projected = worldToScreenPoint({ x: 12, y: 8 }, { x: 3, y: 4, zoom: 2 });
const restored: { x: number; y: number } = screenToWorldPoint(projected, { x: 3, y: 4, zoom: 2 });
const connector: string = getNodalConnectorKey('node', 'value', 'output');
void restored;
void connector;
validateGraphDocument(graph, mathDialect);
const result: NodalExecutionResult = executeGraphDocument(graph, mathDialect);
void result;

const registry = new NodalDialectRegistry();
registerNodalDialectContributions(registry, mathDialectContributions);
registry.activate();
void registry.resolve('math');
