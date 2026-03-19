---
name: knowledge
description: >-
  Use when the user wants to promote project-specific notes to a global
  knowledge system, or says "promote knowledge", "compound notes",
  "knowledge synthesis", or "find repeated ideas across projects".
---

# Compound Knowledge Promotion

Identify knowledge that has crystallized across multiple projects and promote it to a global knowledge folder (e.g., WORK, LIFE).

## Workflow

1. **Get vault config** — Call `obsidian_get_config` to identify `knowledge_folders` and `ignored_folders`.

2. **Scan for candidates** — Call `obsidian_list_notes`. Filter results to identify notes that seem like project-specific knowledge (e.g., in `working/*/knowledge/` or tagged `#knowledge`).

3. **Semantic clustering** — For each candidate knowledge note path, call `obsidian_rag_query`
   with the note filename (without extension) as query, `limit: 8`.
   Track which notes appear in results from 2+ different projects or contexts — these are candidates for promotion.

4. **Read candidates** — Call `obsidian_read_note` on shortlisted files.
   Look for shared definitions, patterns, or insights worth generalizing.

5. **Draft global note** — Compose a new note for the concept. 
   - **Destination:** If multiple `knowledge_folders` exist, ask the user which one this belongs to (e.g., "Should this go to WORK or LIFE?").
   - **Content:** Synthesize the body, add frontmatter (`type: concept`), and a `## Source Notes` section with `[[wikilinks]]`.

6. **Show draft to user** — Present the proposed note content and path before creating.
   Ask for confirmation.

7. **Create on approval** — Call `obsidian_create_note` with the approved content.

8. **Report cross-links** — Suggest which source notes should now link to the new global note.

## Tips

- If `obsidian_rag_query` returns no results, suggest running `/obsidian:index` first.
- If no notes appear in multiple contexts, report that and suggest manual promotion.
