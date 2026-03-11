# Release v1.5.0

## Summary
This release introduces robust multi-vault support and advanced workspace isolation for your Obsidian "Second Brain." By decoupling metadata storage from a single global location, users can now manage multiple independent knowledge bases, practically eliminating the risk of collisions via a hash-based fallback mechanism. The update also includes significant reliability improvements to the RAG engine, ensuring that your semantic index remains consistent even in the face of partial failures.

## New Features
- **Workspace-Aware Isolation**:
  - You can now specify a `workspace_path` to store your vector indices and file hashes in a dedicated project folder.
  - Automatically defaults to a **Hashed Global Cache** when no workspace is provided, ensuring unique indices for every vault you use.
  - This allows you to track your AI metadata in Git alongside your notes if desired.

- **Advanced Multi-Vault Support**:
  - The extension now correctly identifies and switches between different vaults within the same session.
  - Internal database connections are automatically reset and re-established when you change your vault configuration.

## Reliability & Integrity
- **Atomic Indexing**: Implemented precise chunk tracking. File hashes are now only updated once *every* chunk of a file has been successfully embedded and persisted, preventing "partially indexed" states.
- **Thread Safety**: Added a locking mechanism to serialize database operations, preventing race conditions during intensive indexing tasks.
- **Robust Path Handling**: Upgraded path validation to fully support Windows file systems, Unicode filenames, and prevent path traversal attacks.

## Developer Experience
- **Simplified Configuration**: Refactored configuration loading to ensure environment variables consistently override cached settings, making it easier to integrate into automated workflows.

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