# Third-party notices

## PGlite (bundled in `vendor/pglite/`)

SQL runs on [PGlite](https://github.com/electric-sql/pglite), PostgreSQL compiled to WebAssembly,
copied unmodified from the `@electric-sql/pglite` npm package (version in `js/sql/worker.js`).
PGlite is licensed under the Apache License 2.0 (full text: `vendor/pglite/LICENSE`).
PostgreSQL itself is distributed under the PostgreSQL License.

## Fonts

The UI requests IBM Plex Sans and IBM Plex Mono (SIL Open Font License 1.1) from Google Fonts at run time.
They are not bundled; the app falls back to system fonts when offline.

## Development dependencies (not shipped)

`jsdom` and `fake-indexeddb` are used only by the test suite.
