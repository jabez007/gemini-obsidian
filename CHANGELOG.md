# Changelog

All notable changes to this project will be documented in this file.

## [1.7.0] - 2026-04-11

### Added

- **Skills**: compound, cross-linker, index, journal, links, research, search, vault, vault-lint, wiki-ingest
- **Agents**: researcher (deep vault research), librarian (vault organization)
- SECURITY.md, CODE_OF_CONDUCT.md, PR template
- Repository metadata in package.json

### Fixed

- LanceDB stale fragment error on incremental reindex — call `table.optimize()` after indexing

### Changed

- Updated dependencies: @lancedb/lancedb 0.27, sharp 0.34, esbuild 0.28, TypeScript 6.0, @modelcontextprotocol/sdk 1.29

## [1.6.1] - 2026-03-30

### Build & Maintenance
- build(deps-dev): bump picomatch from 4.0.3 to 4.0.4

## [1.6.0] - 2026-03-19

### Features
- feat: add inline text replacement and broken link detection tools
- feat: add session initialization and frontmatter validation hooks
- feat: add new vault management skills (knowledge, link-audit, moc-update)

### Documentation
- docs: update README and obsidian-companion skill guidelines


## [1.5.0] - 2026-03-12

### Features
- feat: follow symlinks to support indexing external files

### Build & Maintenance
- build(deps): update mcp-related dependencies and rebuild dist
- chore(deps): bump ajv, express-rate-limit, ip-address, qs, minimatch, and hono
- chore: synchronize distribution bundle with version bump

## [1.4.0] - 2026-03-08

### Features
- feat(obsidian): add obsidian_replace_section and obsidian_insert_at_heading tools
- feat(obsidian): overhaul obsidian_append_daily_log with section range awareness

### Fixed
- fix(security): implement path traversal protection with getSafeFilePath

### Refactor
- refactor(rag): extract chunking logic to standalone module
- refactor(utils): centralize shared markdown utilities

### Testing
- test: add vitest infrastructure and comprehensive unit test suite

### CI/CD
- ci: add GitHub Actions workflow for automated testing

## [1.3.0] - 2026-02-08

### Features
- feat(rag): implement incremental indexing and overhaul vault processing

### Fixed
- fix: pin onnxruntime-node to 1.14.0 and add runtime compatibility check

## [1.2.0] - 2026-02-07

### Added
- feat(rag): overhaul indexing for large vaults and reliability

### Fixed
- fix: correctly handle boolean flags in CLI and prevent full re-index in hooks
- fix: use stdin for hook input to avoid shell substitution errors

### Changed
- chore: ensure dist/ is not ignored
- chore: update package-lock.json

## [1.1.0] - 2026-02-05

### Features
- 5d36f61 FEAT: implement incremental vault indexing

## [1.0.4] - 2026-02-05

... (rest of the file)
