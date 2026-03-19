---
name: link-audit
description: >-
  Use when the user wants to audit vault link health, find broken wikilinks,
  orphaned notes, or semantic clusters. Triggers on "link audit", "broken links",
  "link health", "graph cleanup", or "find orphans".
---

# Vault Link Audit

Comprehensive audit of link health: broken wikilinks, orphaned notes, and semantic suggestions.

## Workflow

1. **Get vault config** — Call `obsidian_get_config` to identify `ignored_folders`.

## Phase 1 — Broken Links

1. Call `obsidian_get_broken_links` (optionally with `subfolder` argument).
2. Present broken links grouped by originating file.
3. For each, suggest: delete the link, create a stub note, or correct the target name.
4. Offer to skip broken links originating in `ignored_folders`.

## Phase 2 — Orphaned Notes

1. Call `obsidian_list_notes` to enumerate all notes in scope.
2. For each candidate orphan, call `obsidian_get_backlinks`.
3. Notes with zero backlinks and NOT in `ignored_folders` are orphan candidates.
4. Present orphan list with options: link from a relevant note, move to archive, or delete.

## Phase 3 — Semantic Suggestions (Optional)

If the user asks for deeper suggestions:

1. For each orphan, call `obsidian_rag_query` with the orphan title as query, `limit: 5`.
2. If strong matches exist, suggest `[[wikilink]]` connections.

## Arguments

Optional subfolder: `/link-audit <primary_knowledge_folder>/`

## Tips

- For large vaults, always scope to a subfolder first; a full-vault orphan scan is slow
- Broken links in `ignored_folders` are usually harmless; offer to skip them
- Never make edits without per-change user confirmation
- Run `/obsidian:index` first if `obsidian_get_broken_links` seems incomplete
