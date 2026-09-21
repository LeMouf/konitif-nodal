# @konitif/nodal

Portable graph mechanics, scoped projection contributions and deterministic
execution for KONITIF systems.

## Installation

```sh
npm install @konitif/nodal
```

## What it provides

- Graph, node, port, edge and group models.
- Explicit graph-edit commands and commit results.
- Validation and stable JSON serialization.
- Host-scoped schema, admission and execution contributions.
- A small built-in mathematical reference dialect.
- Deterministic graph execution and observable results.
- Adapters between Nodal graphs and `@konitif/composition` workflows.
- Host-scoped presentation contributions keyed by an extensible projection kind.
- Headless coordinate/grid, connection-draft, port-state and group-layout projection mechanics.
- Stable visible-world containment across host panel resizes.
- Explicit dialect- and presentation-registry activation, deactivation and disposal.
- A portable Nodal tool-module declaration.

## Authority boundary

A graph-native document may own graph semantics. A graph projected from a
Composition does not: `@konitif/composition` remains its authority, and this
package neither re-exports nor duplicates Composition contracts.

Dialect and presentation registries are created and populated by each host.
Schema declarations, admission rules and node executors remain distinct even
when a compatibility dialect bundles them for an older caller. Registering a
dialect or importing a specialization does not mutate process-global state.
Projection kinds are open identifiers, allowing independent Nodal, workflow or
block-based surfaces without making one renderer canonical. Domain dialects,
admission policy, UI components and host stores remain outside this package.

The version-1 document keeps its existing position, appearance and runtime-state
fields for serialized compatibility. Consumers must treat those fields as
projection or observation data, not as Composition authority.

Coordinate and interaction helpers derive visual values from public graph
contracts. They do not measure DOM elements, execute graph commands, load
documents or create a second graph authority. Browser connector measurement
and pointer-target classification remain responsibilities of a visual host.

## Quick start

```ts
import {
  createNodalGraphDocument,
  composeNodalDialect,
  executeGraphDocument,
  mathDialectContributions,
  NodalDialectRegistry,
  NodalPresentationRegistry,
  registerNodalDialectContributions,
  validateGraphDocument,
} from '@konitif/nodal';

const dialects = new NodalDialectRegistry();
registerNodalDialectContributions(dialects, mathDialectContributions);
dialects.activate();
const runtime = dialects.resolve('math');
if (!runtime) throw new Error('Missing math dialect');

// Compatibility bundle for graph helpers that still accept one dialect value.
const math = composeNodalDialect(runtime);
const graph = createNodalGraphDocument({ dialect: math.id });
const validation = validateGraphDocument(graph, math);
const execution = executeGraphDocument(graph, math);

const presentations = new NodalPresentationRegistry();
presentations.register({
  id: 'example.workflow.presentation',
  version: '1.0.0',
  dialectId: math.id,
  projectionKind: 'workflow',
  presentation: {
    families: {
      source: { color: '#86b9ff', rgb: '134, 185, 255' },
      compute: { color: '#ffd56a', rgb: '255, 213, 106' },
      output: { color: '#7de0b0', rgb: '125, 224, 176' },
    },
  },
});
presentations.activate();
```

## Public entry points

| Entry | Purpose |
| --- | --- |
| `@konitif/nodal` | Graph contracts, commands, validation, execution, scoped presentation registries and Composition adapters. |

## Reference

See [`reference/`](reference/) for the machine-readable capability catalog and
authority diagram.

## License

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE.md), not OSI open
source. Commercial use requires separate written authorization.
