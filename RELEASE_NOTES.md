# Release v1.6.0

## Summary
This release introduces advanced vault management capabilities, including broken link detection, surgical inline text replacement, and automated workspace hooks. We have also added three new specialized skills to enhance long-term knowledge management and vault health.

## New Features
- **Vault Health & Repair**:
  - `obsidian_get_broken_links`: Automatically identifies all wikilinks in the vault that point to non-existent notes.
  - `obsidian_replace_in_note`: Enables targeted, surgical text replacement for repairing broken links without rewriting entire files.
  - Upgraded `obsidian_update_frontmatter` to support single-key and batch updates.

- **Automated Lifecycle Hooks**:
  - **Session Initialization**: Automatically reports vault status and refreshes the RAG index when a Gemini session starts.
  - **Frontmatter Validation**: Prevents the creation of notes with missing required metadata fields via configurable schema rules.
  - **Note Re-indexing**: Specialized re-indexing script for more efficient single-note updates.

- **New AI Skills**:
  - `knowledge`: Tools for promoting cross-project findings to the global engineering vault.
  - `link-audit`: Comprehensive audit of broken links, orphaned notes, and semantic clusters.
  - `moc-update`: Automated suggestions for updating Maps of Content (MOCs) after note creation.

## Developer Experience
- **Expanded Test Coverage**: New tests for batch frontmatter updates, surgical replacement logic, and recursive note listing.
- **Improved Utilities**: Refactored internal file handling to support robust recursive path patterns.

---

# Release v1.4.0

## Summary
This release is a major step forward for `gemini-obsidian`, focusing on security, architecture, and developer productivity. We have implemented critical security hardening to prevent path traversal vulnerabilities, refactored the RAG (Retrieval-Augmented Generation) engine for better maintainability, and introduced powerful new tools for surgical manipulation of Markdown sections. Additionally, a full testing suite and CI/CD pipeline have been established to ensure ongoing stability.

## New Features
- **Surgical Section Tools**:
  - `obsidian_replace_section`: Replace the body of a heading without touching the rest of the file.
  - `obsidian_insert_at_heading`: Insert content at the beginning or end of a specific section.
  - Enhanced `obsidian_append_daily_log`: Now uses the new section range logic for more robust appending under headings.

- **RAG Refactor**:
  - Extracted the chunking and embedding logic into a dedicated standalone module (`src/rag/chunking.ts`).
  - Improved text splitting and segment merging algorithms for more efficient embedding.

## Security Hardening
- **Path Traversal Protection**: Implemented strict path validation (`getSafeFilePath`) across all tool handlers. This prevents accidental or malicious access to files outside of the defined Obsidian vault boundary.

## Developer Experience & Quality
- **Testing Suite**: Added a comprehensive unit testing suite using `vitest`, covering chunking, utility functions, and vault operations.
- **CI/CD**: Integrated GitHub Actions for automated verification of every commit.

## Operational Notes
- The vault path is now strictly enforced. Ensure your `OBSIDIAN_VAULT_PATH` or the path passed via `obsidian_set_vault` is a valid absolute path.

# Release v1.3.0

## Summary
This release focuses on improving the robustness and efficiency of the RAG (Retrieval-Augmented Generation) system. It introduces a significant overhaul to the vault processing engine, enabling true incremental indexing. This means only modified files are processed, drastically reducing the time and resources needed to keep your vault index up to date. Additionally, strict runtime checks and dependency pinning have been added to ensure stability across different environments.

## New Features
- **Incremental Indexing & Vault Overhaul**:
  - The indexing engine now tracks file hashes to identify changed content.
  - Only modified or new files are re-embedded and updated in the vector database.
  - This overhaul improves performance for large vaults and reduces API usage for embedding models.

## Bug Fixes
- **Runtime Compatibility**:
  - Pinned `onnxruntime-node` to version `1.14.0` to ensure compatibility with `@xenova/transformers`.
  - Added a startup check that verifies the installed `onnxruntime-node` version matches requirements, preventing obscure runtime crashes.

## Operational Notes
- If you encounter errors related to `onnxruntime-node` after upgrading, please ensure you run `npm install` in the extension directory to apply the pinned version.

# Release v1.2.0
...