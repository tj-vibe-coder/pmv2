# Known Issues

## Local sandbox seed selects an incompatible backup

`npm run sandbox:seed` selects the lexicographically newest backup directory. As of 2026-07-27 that is `backups/2026-07-15T05-33-12`, a recursive export that the flat-JSON seed script skips, resulting in zero loaded documents.

For a representative local Calcsheet smoke test, use:

```bash
npm run emulator
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/sandbox-seed.js backups/2026-07-15T05-32-40
npm run start:sandbox
```

The seed script correctly refuses to run when `FIRESTORE_EMULATOR_HOST` is absent, protecting production data.

## Build warnings

- The current CRA main bundle is approximately 2.07 MB before further code-splitting work.
- Browserslist data is stale and emits an update warning.
- Node 24 emits an `fs.F_OK` deprecation warning; deployment targets Node 22.

## Finance trace read cost

The Finance Money Trail read endpoint currently derives the relationship graph by reading the six participating finance collections, then applies per-user visibility filtering before traversal and candidate scoring. This avoids a second persistent relationship graph and is correct for the current dataset, but collection growth may make each drawer open expensive. If usage or record counts increase materially, replace the broad reads with indexed reference lookups plus bounded candidate queries while preserving the same visibility checks and response contract.
