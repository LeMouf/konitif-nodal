import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addEdgeToGraph,
  addNodeToGraph,
  captureAdaptiveViewportWindow,
  containAdaptiveViewportWindow,
  createAdaptiveViewportResizeController,
  createNodalGraphDocument,
  executeGraphDocument,
  mathDialect,
  mathDialectContributions,
  composeNodalDialect,
  NodalDialectRegistry,
  NodalPresentationRegistry,
  registerNodalDialectContributions,
  parseGraphDocument,
  serializeGraphDocument,
  validateGraphDocument,
} from '../dist/index.js';

test('preserves the visible world window across panel resizes', () => {
  const controller = createAdaptiveViewportResizeController();
  const landscape = controller.resize({
    viewport: { x: 0, y: 0, zoom: 1 },
    previousSize: { width: 100, height: 100 },
    nextSize: { width: 200, height: 100 },
  });
  assert.deepEqual(landscape, { x: 50, y: 0, zoom: 1 });

  const portrait = controller.resize({
    viewport: landscape,
    previousSize: { width: 200, height: 100 },
    nextSize: { width: 100, height: 200 },
  });
  assert.deepEqual(portrait, { x: 0, y: 50, zoom: 1 });
});

test('rejects invalid viewport windows and honors the host zoom ceiling', () => {
  assert.equal(
    captureAdaptiveViewportWindow({ x: 0, y: 0, zoom: 0 }, { width: 100, height: 100 }),
    null,
  );
  assert.deepEqual(
    containAdaptiveViewportWindow(
      { centerX: 50, centerY: 50, width: 100, height: 100 },
      { width: 400, height: 400 },
      2,
    ),
    { x: 100, y: 100, zoom: 2 },
  );
});

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

test('separates schema, admission and execution contributions in a scoped lifecycle', () => {
  const registry = new NodalDialectRegistry();
  const registrations = registerNodalDialectContributions(registry, mathDialectContributions);

  assert.equal(registry.state, 'created');
  assert.equal(registry.resolve('math'), null);
  registry.activate();

  const runtime = registry.resolve('math');
  assert.ok(runtime);
  assert.equal(runtime.schema.id, 'math');
  assert.ok(runtime.schema.nodeRegistry.every((definition) => !Object.hasOwn(definition, 'execute')));
  assert.ok(runtime.execution.bindings.every((binding) => typeof binding.execute === 'function'));
  assert.equal(typeof runtime.admission?.validate, 'function');

  const compatibilityDialect = composeNodalDialect(runtime);
  const { graph, outputNodeId } = createProofGraph();
  assert.equal(executeGraphDocument(graph, compatibilityDialect).outputsByNodeId[outputNodeId].value, 4);

  assert.throws(() => registry.registerSchema({
    id: 'proof.duplicate-schema',
    version: '1.0.0',
    dialectId: 'math',
    nodeDefinitions: [runtime.schema.nodeRegistry[0]],
  }), /Duplicate Nodal schema target/);

  registry.deactivate();
  assert.equal(registry.resolve('math'), null);
  registry.activate();
  for (const registration of registrations) registration.dispose();
  assert.equal(registry.resolve('math'), null);
  registry.dispose();
  assert.throws(() => registry.resolve('math'), /registry is disposed/);
});

test('scopes presentation contributions to an explicit host lifecycle', () => {
  const registry = new NodalPresentationRegistry();
  const registration = registry.register({
    id: 'proof.presentation',
    version: '1.0.0',
    dialectId: 'proof',
    projectionKind: 'workflow',
    presentation: {
      families: {
        source: { color: '#111111', rgb: '17, 17, 17' },
        compute: { color: '#222222', rgb: '34, 34, 34' },
        output: { color: '#333333', rgb: '51, 51, 51' },
      },
    },
  });

  assert.equal(registry.state, 'created');
  assert.equal(registry.resolve('proof', 'workflow').families.compute.color, '#ffd56a');
  registry.activate();
  assert.equal(registry.resolve('proof', 'workflow').families.compute.color, '#222222');
  assert.equal(registry.resolve('proof', 'blockly').families.compute.color, '#ffd56a');
  registry.deactivate();
  assert.equal(registry.resolve('proof', 'workflow').families.compute.color, '#ffd56a');
  registry.activate();
  registration.dispose();
  assert.equal(registry.resolve('proof', 'workflow').families.compute.color, '#ffd56a');
  registry.dispose();
  assert.equal(registry.state, 'disposed');
  assert.throws(() => registry.list(), /registry is disposed/);
});
