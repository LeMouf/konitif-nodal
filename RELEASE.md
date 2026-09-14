# Release boundary

`@konitif/nodal` is published only from the standalone
`LeMouf/konitif-nodal` repository. A merge does not publish a package.

Before release:

1. install exactly the reviewed lockfile with lifecycle scripts disabled;
2. build ESM and declarations with the locked TypeScript compiler;
3. run package contracts and the isolated archive consumer;
4. review the exact archive file list, integrity and version;
5. require a matching protected `v<version>` tag on `main` and the
   `npm-release` environment;
6. publish the verified archive through GitHub Actions OIDC.

Publication additionally requires the repository variable
`NODAL_NPM_PUBLISH_ENABLED=true`. The initial registry version is a reviewed,
authenticated maintainer bootstrap exception. Configure npm Trusted Publishing
for `LeMouf / konitif-nodal / publish.yml / npm-release` before enabling later
OIDC releases.

## 0.285.0 migration

Composition contracts and helpers are no longer re-exported from
`@konitif/nodal`; import them from `@konitif/composition`. Presentation
contributions now belong to an explicit `NodalPresentationRegistry`. Populate a
host-owned registry, activate it, and pass the resolved presentation to rendering
helpers. Registry targets include an extensible `projectionKind`, and lifecycle
methods make activation, deactivation and disposal observable.

Dialect population is also explicit. Register schema, admission and execution
contributions in a host-owned `NodalDialectRegistry`, activate it, then resolve a
`NodalDialectRuntime`. `composeNodalDialect` is a migration bridge for callers
that still accept the former combined dialect value; it is not a new authority.
