# Release v1.2.0

## Summary
This release significantly improves the reliability and performance of indexing for large Obsidian vaults. It introduces incremental persistence, configurable chunking strategies, and a robust fallback mechanism for embedding failures. Additionally, it addresses several critical bugs related to CLI flag handling and hook execution.

## New Features
- **RAG Indexing Overhaul**:
  - Implemented incremental persistence to reduce memory pressure during indexing.
  - Added configurable chunking via environment variables (`GEMINI_OBSIDIAN_MIN_CHUNK_CHARS`, `GEMINI_OBSIDIAN_MAX_CHUNK_CHARS`, `GEMINI_OBSIDIAN_TARGET_CHUNK_CHARS`).
  - Improved paragraph splitting logic to handle oversized segments more gracefully.
  - Added a fallback mechanism to retry failed embedding batches individually.
  - Added a TTY-aware progress bar for better visibility during long indexing runs.

## Bug Fixes
- Fixed CLI argument parsing to correctly handle boolean flags, preventing unintentional full vault re-indexes when using hooks.
- Switched hook input handling to use `stdin` to prevent shell substitution errors with complex file paths or content.

## Operational Notes
- Users with large vaults should consult the updated README for performance tuning guidance using the new environment variables.

# Release 1.1.0

## Summary
This release introduces incremental indexing for the Obsidian vault. Instead of re-indexing the entire vault on every note change, the extension now only re-indexes the specific file that was modified or created. This significantly improves performance and responsiveness.

## New Features
- **Incremental Indexing**: The `obsidian_rag_index` tool now accepts an optional `file_path` argument to re-index a single file.
- **Enhanced Hooks**: The automated re-indexing hook now utilizes incremental indexing and triggers on frontmatter updates as well as note creation/append.

## Bug Fixes
- Addressed trailing whitespace issues in `src/rag/store.ts`.

# Release 1.0.4

## Summary
This release significantly improves the stability and ease of use for the extension. It addresses critical issues with bundling, dependency management, and storage paths.

## Bug Fixes
- **Robust Installation**: The extension now defensively checks for missing native dependencies at startup and provides clear instructions if `npm install` is needed.
- **Connection Stability**: Fixed "Connection closed" errors by properly bundling `@xenova/transformers` with a compatibility shim.
- **Consistent Storage**: The vector database is now stored at `~/.gemini-obsidian-lancedb`, preventing errors when running the extension from different directories.

## Operations
- If you see an error about missing dependencies (`@lancedb/lancedb`), please run `npm install` inside the extension directory.

# Release 1.0.3
...