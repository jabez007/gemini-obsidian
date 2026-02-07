# Changelog

All notable changes to this project will be documented in this file.

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

### Fixed
- **Bundling**: Correctly bundle `@xenova/transformers` by shimming `import.meta.url` to fix "Connection closed" errors.
- **Robustness**: Move native dependency checks (`@lancedb/lancedb`, `onnxruntime-node`) to the very top of the extension to prevent early crashes and provide clear error messages.
- **Storage**: Use absolute paths (`~/.gemini-obsidian-lancedb`) for the vector database to prevent `ENOENT` errors when working directories change.
- **Dependencies**: Clean up `dependencies` vs `devDependencies` to ensure correct runtime installation.

## [1.0.3] - 2026-02-05

### Fixed
- Ensure all externalized dependencies are in `dependencies` instead of `devDependencies`.

## [1.0.2] - 2026-02-05

### Fixed
- Fix MCP connection closed error by externalizing transformers and native dependencies in bundle.

## [1.0.1] - 2026-02-05

### Refactor
- Bundle extension with esbuild to improve distribution
- Switch from tsc to esbuild for building

### Documentation
- Revise installation steps and configuration options
- Add demo section to README
- Update README, add demo gif and repo updates

### Dependencies
- Bump @modelcontextprotocol/sdk to 1.26.0

## [1.0.0] - 2026-02-04

### Added
- Initial release of Gemini Obsidian extension.
- Core tools: `obsidian_list_notes`, `obsidian_read_note`, `obsidian_create_note`, `obsidian_append_note`, `obsidian_search_notes`.
- Advanced tools: `obsidian_rag_index`, `obsidian_rag_query` for semantic search using LanceDB and Xenova transformers.
- Graph tools: `obsidian_get_backlinks`, `obsidian_get_links`.
- Daily note integration: `obsidian_get_daily_note`, `obsidian_append_daily_log`.
- Utility tools: `obsidian_move_note`, `obsidian_update_frontmatter`.
- Configuration management via `obsidian_set_vault`.
- MCP Server implementation.