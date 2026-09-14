import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addEdgeToGraph,
  addNodeToGraph,
  createNodalGraphDocument,
  executeGraphDocument,
  mathDialect,
  parseGraphDocument,
  serializeGraphDocument,
  validateGraphDocument,
} from '../dist/index.js';

function createProofGraph() {
  let graph = createNodalGraphDocument({ dialect: mathDialect.id, id: 'graph:proof' });
  const constant = addNodeToGraph(graph, mathDialect, {
    nodeType: 'constant:number',
    position: { x: 0, y: 0 },
    config: { value: 4 },
  });
  graph = constant.graph;
  const output = addNodeToGraph(graph, mathDialect, {
    nodeType: 'graph:output',
    position: { x: 200, y: 0 },
  });
  graph = addEdgeToGraph(output.graph, mathDialect, {
    sourceNodeId: constant.nodeId,
    sourcePortId: 'value',
    targetNodeId: output.nodeId,
    targetPortId: 'value',
  }).graph;
  return { graph, outputNodeId: output.nodeId };
}

test('validates and executes a product-neutral graph deterministically', () => {
  const { graph, outputNodeId } = createProofGraph();
  assert.equal(validateGraphDocument(graph, mathDialect).valid, true);
  assert.equal(executeGraphDocument(graph, mathDialect).outputsByNodeId[outputNodeId].value, 4);
});

test('round-trips a graph through its stable serialized representation', () => {
  const { graph } = createProofGraph();
  assert.deepEqual(parseGraphDocument(serializeGraphDocument(graph)), graph);
});
