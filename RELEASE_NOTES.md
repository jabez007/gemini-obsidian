# Release v1.7.0

## Summary
This release is a major consolidation that brings together advanced vault management with robust workspace isolation. By integrating the latest upstream features (broken link detection, frontmatter validation) with our new Workspace Isolated Storage, users now have the most powerful and flexible environment for managing their Obsidian knowledge base.

## New Features
- **Workspace-Aware Isolation**:
  - Specify a `workspace_path` to store vector indices and file hashes in a dedicated project folder.
  - Automatically defaults to a **Hashed Global Cache** when no workspace is provided, ensuring unique indices for every vault.
  - Track AI metadata in Git alongside your notes for better portability.

- **Advanced Vault Health & Repair**:
  - `obsidian_get_broken_links`: Automatically identifies wikilinks pointing to non-existent notes.
  - `obsidian_replace_in_note`: Targeted, surgical text replacement for repairing links or content.
  - Enhanced `obsidian_update_frontmatter` with batch update support.

- **Automated Lifecycle Hooks**:
  - **Session Initialization**: Refreshes RAG index and reports status on startup.
  - **Frontmatter Validation**: Configurable rules to enforce required metadata.

## Reliability & Performance
- **Atomic Indexing**: Precise chunk tracking ensures consistency even during partial failures.
- **Thread Safety**: Locking mechanism for database operations prevents race conditions.
- **Incremental Indexing**: Only modified files are re-processed, drastically reducing overhead.

## New AI Skills
- `knowledge`: Tools for promoting findings to global vaults.
- `link-audit`: Audit of broken links and semantic clusters.
- `moc-update`: Suggestions for updating Maps of Content (MOCs).

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

# Release v1.4.0
...
