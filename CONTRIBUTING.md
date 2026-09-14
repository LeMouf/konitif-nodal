# Contributing to @konitif/nodal

Consumer documentation belongs in `README.md`. Machine-readable package
documentation belongs in `reference/`; release policy and agent instructions
must remain in their dedicated repository files.

Use the committed lockfile and disable lifecycle scripts during installation:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run verify:package
```

Keep graph authority independent from editors and domain dialects; keep relative Node ESM imports explicit. Follow `RELEASE.md` for publication.
