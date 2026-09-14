# @konitif/nodal

Product-neutral graph authoring, validation, serialization and deterministic
execution for KONITIF applications.

## Installation

```sh
npm install @konitif/nodal
```

## What it provides

- Canonical graph, node, port, edge and group models.
- Explicit graph-edit commands and commit results.
- Validation and stable JSON serialization.
- Dialect contracts with a small built-in mathematical dialect.
- Deterministic graph execution and observable results.
- Adapters between Nodal graphs and `@konitif/composition` workflows.
- A product-neutral Nodal tool-module declaration.

## Authority boundary

The graph document is independent from its editor and rendering surface.
Product dialects, product policy, UI components and application stores remain
outside this package. Composition adapters preserve the distinction between a
graph projection and the canonical workflow they read or update.

## Quick start

```ts
import {
  createNodalGraphDocument,
  executeGraphDocument,
  mathDialect,
  validateGraphDocument,
} from '@konitif/nodal';

const graph = createNodalGraphDocument({ dialect: mathDialect.id });
const validation = validateGraphDocument(graph, mathDialect);
const execution = executeGraphDocument(graph, mathDialect);
```

## Public entry points

| Entry | Purpose |
| --- | --- |
| `@konitif/nodal` | Graph contracts, commands, validation, execution and Composition adapters. |

## Reference

See [`reference/`](reference/) for the machine-readable capability catalog and
authority diagram.

## License

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE.md), not OSI open
source. Commercial use requires separate written authorization.
