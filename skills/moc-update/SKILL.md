---
name: moc-update
description: >-
  Use after creating a new note in a knowledge system to suggest which
  Maps of Content (MOCs) or Bases it belongs in. Triggers on "update MOC",
  "add to MOC", "which MOCs", or when a new global note is created.
---

# MOC/Base Update After New Note

Find the MOCs or "Bases" that should link to a newly created note and suggest the additions.

## Workflow

1. **Get vault config** — Call `obsidian_get_config` to identify `knowledge_folders`, `moc_folders`, and `ignored_folders`.

2. **Identify the new note** — Path follows the skill invocation. If not provided, ask.

3. **Semantic MOC search** — Call `obsidian_rag_query` with the note title as query, `limit: 10`.
   Flag results that are MOC-style notes or "Bases":
   - **Folder Match:** Path is inside any of the `moc_folders` (e.g., `_SYS/`).
   - **Pattern Match:** Filename contains "MOC", "Base", "Index", or ends in "-MOC".
   - **Metadata Match:** Frontmatter has `type: moc` or `type: base`.

4. **Keyword fallback** — Call `obsidian_search_notes` with key terms from the note title
   to catch candidates that aren't yet indexed. Skip any results in `ignored_folders`.

5. **Present suggestions** — For each candidate, show:
   - The path
   - Which heading the link should go under (if readable)
   - A proposed link line: `- [[NoteName]] — one-line description`

6. **Append on confirmation** — Call `obsidian_insert_at_heading` (preferred) or
   `obsidian_append_note` to add the link. Never edit without user approval.

## Arguments

New note path: `/moc-update WORK/AuthPatterns.md`

## Tips

- If the vault has no MOCs/Bases yet, offer to create a starter one in the preferred `moc_folders`.
- Always skip folders in `ignored_folders` during candidate identification.
