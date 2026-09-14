# Workflow Composition Authority Contract

`Workflow.composition` is the authored and executed authority.

`NodalGraphDocument` is an editable projection. The editor may manipulate it, but an accepted edit must cross the projection command boundary, update the Workflow Composition, and then be projected back before it becomes observable state.

```text
Workflow Composition (authority)
  -> Nodal Graph (editable projection)
  -> graph edit command
  -> composition admission + commit
  -> Workflow Composition (next authority)
  -> Nodal Graph (next projection)
```

Runtime execution receives a `Workflow` and derives the compatibility graph required by the current Nodal executor. The compatibility graph is an execution representation; it never becomes the authored source of truth.

Legacy tool states containing only `graph` are admitted at the persistence boundary and migrated once to `workflow`. New serialized tool states persist `workflow`, not a second authoritative graph.

## Diagnostic compatibility

The historical `CompositionShadowState` remains temporarily available to compare old and new paths in technical diagnostics. It is not an authority and must not drive product behavior. Its `shadowRevision` remains a local diagnostic counter only.

## Invariants

- catalogue, layout and shell are projected from one `WorkspacePresetArtifact`;
- Workflow Composition owns modules, connections, domains and contracts;
- Nodal Graph owns no authored business state;
- graph-only presentation changes update projection metadata without invalidating a runtime result;
- runtime-affecting graph edits advance the composition revision and invalidate the previous run;
- runtime observations may enrich a displayed projection but never overwrite the authored Workflow.
