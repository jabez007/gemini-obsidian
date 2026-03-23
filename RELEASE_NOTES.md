# Release v1.7.0

## Summary
This release is a major consolidation that brings together advanced vault management with robust workspace isolation, 10 new skills, and 2 new agents. By integrating the latest upstream features (broken link detection, frontmatter validation, and new skills) with our new Workspace Isolated Storage, users now have the most powerful and flexible environment for managing their Obsidian knowledge base.

## New Features
- **Workspace-Aware Isolation**:
  - Specify a `workspace_path` to store vector indices and file hashes in a dedicated project folder.
  - Automatically defaults to a **Hashed Global Cache** when no workspace is provided, ensuring unique indices for every vault.
  - Track AI metadata in Git alongside your notes for better portability.
  - **New**: Configure specific folders for `knowledge`, `moc`, and `daily_notes`, or ignore specific directories via `obsidian_set_vault`.

- **New AI Skills & Agents**:
  - **Skills**: compound, cross-linker, index, journal, links, research, search, vault, vault-lint, wiki-ingest.
  - **Agents**: researcher (deep vault research with semantic search chaining), librarian (vault organization and maintenance).
  - **Existing Skills Updated**: knowledge (promotion to global vaults), link-audit (broken links/orphans), moc-update (MOC suggestions).

- **Advanced Vault Health & Repair**:
  - `obsidian_get_broken_links`: Automatically identifies wikilinks pointing to non-existent notes.
  - `obsidian_replace_in_note`: Targeted, surgical text replacement for repairing links or content.
  - Enhanced `obsidian_update_frontmatter` with batch update support.
  - `obsidian_get_config`: Retrieve the current session configuration, including all folder settings.

- **Automated Lifecycle Hooks**:
  - **Session Initialization**: Refreshes RAG index and reports status on startup.
  - **Frontmatter Validation**: Configurable rules to enforce required metadata.

## Reliability & Performance
- **Atomic Indexing**: Precise chunk tracking ensures consistency even during partial failures.
- **Thread Safety**: Locking mechanism for database operations prevents race conditions.
- **Incremental Indexing**: Only modified files are re-processed, drastically reducing overhead.
- **LanceDB Fix**: Fixed stale fragment error by calling `table.optimize()` after indexing.

## Infrastructure
- Updated dependencies: @lancedb/lancedb 0.27, sharp 0.34, esbuild 0.28, TypeScript 6.0, @modelcontextprotocol/sdk 1.29.
- Added SECURITY.md, CODE_OF_CONDUCT.md, PR template.
- Added repository metadata to package.json.

---

# Release v1.6.1

## Summary
Routine maintenance release. Bumps the `picomatch` dev-dependency from 4.0.3 to 4.0.4 (security/patch update via Dependabot). No functional changes.

## Build & Maintenance
- **picomatch** upgraded from 4.0.3 → 4.0.4 (dev dependency)

---

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

# Release v1.5.0

## Summary
This release introduces workspace-aware metadata storage, providing better isolation for multiple vaults and allowing users to store indexing data within project directories. We have also hardened path validation and improved the reliability of incremental indexing.

## New Features
- **Workspace-Aware Isolation**:
  - Implement workspace-aware metadata storage for RAG index and hashes.
  - Add support for multiple isolated vaults using a hashed global cache.
  - Persist vault and workspace paths, with environment variable overrides at load time.
  - Follow symlinks to support indexing external files.

## Fixed
- **Incremental Indexing**: Atomic hash updates prevent stale indices on partial failures.
- **Cross-Platform Support**: Harden path validation for Windows separators and Unicode filenames.
- **Stability**: Ensure stale database connections are cleared when switching vaults.

## Refactor
- **Thread Safety**: Implement thread-safe locking for database operations.
- **Architecture**: Decouple storage path resolution from singleton state.

---

# Release v1.4.0
<<<<<<< HEAD

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

## Summary
This release introduces significant improvements to the indexing engine for better reliability and performance with large vaults. It also refines the CLI and hook integration for a smoother experience.

## New Features
- **Large Vault Indexing**: Overhauled the indexing process to handle large volumes of notes more reliably, with better error recovery and progress reporting.

## Bug Fixes
- **CLI Flags**: Correctly handle boolean flags in the CLI.
- **Hook Integration**: Prevent full re-indexing during hook execution to improve performance and avoid redundant work.
- **Input Handling**: Use stdin for hook input to avoid issues with shell substitution and large payloads.

## Operational Notes
- The `dist/` directory is no longer ignored by git, ensuring that built assets are available for distribution.
- `package-lock.json` has been updated to reflect current dependency states.
||||||| parent of 48fd365 (Add configurable vault folders and expose obsidian_get_config tool (#5))
...
=======

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
>>>>>>> 48fd365 (Add configurable vault folders and expose obsidian_get_config tool (#5))
