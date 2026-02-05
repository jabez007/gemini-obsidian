# Changelog

All notable changes to this project will be documented in this file.

## [1.0.5] - 2026-02-05

### Fixed
- Bundle `@xenova/transformers` by shimming `import.meta.url` to fix "Connection closed" errors.
- Add defensive startup check for missing native dependencies (`@lancedb/lancedb`) with clear instructions.
- Ensure storage path is absolute (~/.gemini-obsidian-lancedb) for consistency.

## [1.0.4] - 2026-02-05

### Fixed
- Use absolute path for LanceDB storage in the home directory to avoid issues with stale working directories.

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
