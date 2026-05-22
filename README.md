# Gemini Obsidian MCP

This project integrates your **Obsidian Vault** into both **Codex** and the legacy **Gemini CLI** extension system. It exposes the same local MCP server in both hosts so you can read, search, connect, and maintain notes from either workflow.

## Features

- **🧠 Hybrid Search (RAG + FTS)**: Ask natural language questions about your notes. The server indexes your vault using embeddings (via LanceDB) and native Full-Text Search (FTS / BM25) to find highly relevant context by combining semantic meaning with precise keyword matching.
- **🕸️ Graph Traversal**: Navigate your knowledge graph. Find backlinks (`[[linked from]]`) and outgoing links to surf your ideas.
- **🛠️ Link Repair**: Audit broken wikilinks and make surgical in-note replacements without rewriting whole files.
- **📝 Smart Journaling**: Fetch today's daily note or append logs to specific headings (e.g., `## Work Log`) with timestamps.
- **⚡ Management**: Create, move, rename notes, safely update YAML frontmatter in single or batch mode, and edit specific sections.
- **🔍 Fuzzy Search**: Quickly find files by name or content.

## Demo

![demo.gif](docs/demo.gif)

## Prerequisites

- **Node.js**: v18 or higher.
- **Codex CLI** or **Gemini CLI**.
- **Obsidian Vault**: A local folder containing your markdown notes.

## Installation

### Codex plugin

This repo now includes a Codex plugin manifest at `.codex-plugin/plugin.json` and an MCP launcher at `.mcp.json`. Install it as a local plugin from this repo, then make sure dependencies are installed:

```sh
npm install
npm run build
```

### Gemini CLI extension

Gemini compatibility remains in place through `gemini-extension.json`:

```sh
gemini extensions install https://github.com/thoreinstein/gemini-obsidian
cd ~/.gemini/extensions/gemini-obsidian && npm install && npm run build
```

## Configuration

The server needs to know where your Obsidian vault is located.

### Option 1: Environment variables

Set these in your shell profile:

```bash
export OBSIDIAN_VAULT_PATH="/Users/you/Documents/MyVault"
# Optional: neutral, Codex, and legacy Gemini names are all accepted
export OBSIDIAN_WORKSPACE_PATH="/Users/you/Documents/MyProject"
export OBSIDIAN_VAULT_ID="my-personal-knowledge-base"
```

Also supported for backward compatibility: `CODEX_OBSIDIAN_*` and `GEMINI_OBSIDIAN_*`.

### Option 2: Runtime configuration

The first time you use a tool, the server can persist `vault_path`, `workspace_path`, and `vault_id`. It now reads the neutral config path `~/.obsidian-mcp.config.json` and still falls back to the legacy Gemini path `~/.gemini-obsidian.config.json`.

## Data Storage & Troubleshooting

- **Vector Index & Hashes**:
  - The server calculates a **Vault Identifier** to isolate metadata for different vaults.
  - By default, this is an **MD5 hash of the absolute vault path**.
  - If a **`vault_id`** is provided (via env var or config), it is used directly instead of the path hash. This is recommended if you sync your vault across machines where absolute paths might differ.
  - Storage location:
    - If a **workspace path** is configured, metadata is stored in `<workspace_path>/.gemini-obsidian/vaults/<vault_identifier>/`.
    - Otherwise, it defaults to a **Hashed Global Cache** in `~/.gemini-obsidian/vaults/<vault_identifier>/`.
- **Cache Reset**: If you suspect the index is corrupted or want a fresh start, you can manually delete the vault-specific folder (`.gemini-obsidian/vaults/<vault_identifier>`) in your workspace or the corresponding entry in the global cache. The next time you run `obsidian_rag_index`, it will be recreated.
- **Module Not Found Error**: If you see an error like `Cannot find module '@lancedb/lancedb'`, run `npm install` in the repo or installed extension/plugin directory.
- **Logs**: Since this runs as an MCP server, errors are typically output to stderr.

## Indexing Performance Tuning

> [!WARNING]
> Initial semantic indexing can be time- and resource-intensive, especially on large vaults.
> For first-time indexing on larger vaults, prefer running indexing directly from the project directory:
> `node dist/index.js obsidian_rag_index`

For large vaults, you can tune indexing throughput and chunk size with environment variables. Neutral names are preferred, but the Gemini-prefixed names still work:

- `OBSIDIAN_EMBED_BATCH_SIZE` or `GEMINI_OBSIDIAN_EMBED_BATCH_SIZE` (default: `48`)
- `OBSIDIAN_MIN_CHUNK_CHARS` or `GEMINI_OBSIDIAN_MIN_CHUNK_CHARS` (default: `40`)
- `OBSIDIAN_MAX_CHUNK_CHARS` or `GEMINI_OBSIDIAN_MAX_CHUNK_CHARS` (default: `1800`)
- `OBSIDIAN_TARGET_CHUNK_CHARS` or `GEMINI_OBSIDIAN_TARGET_CHUNK_CHARS` (default: `700`)

Example preset for very large vaults:

```bash
OBSIDIAN_EMBED_BATCH_SIZE=48 \
OBSIDIAN_TARGET_CHUNK_CHARS=900 \
OBSIDIAN_MIN_CHUNK_CHARS=60 \
node dist/index.js obsidian_rag_index
```

## Host-specific assets

- **Codex** uses `.codex-plugin/plugin.json`, `.mcp.json`, and the repo `skills/` directory.
- **Gemini CLI** continues to use `gemini-extension.json`, `commands/`, and `hooks/hooks.json`.
- **Compatibility note**: the Gemini slash commands and lifecycle hooks remain Gemini-specific. Codex support is provided through MCP tools plus the shared skills.

## Available Tools

The following tools are exposed through the MCP server for either host:

### Retrieval & Search
- `obsidian_rag_index`: Index the vault for semantic search.
- `obsidian_rag_query`: Perform a semantic search query.
- `obsidian_search_notes`: Simple text/filename search.
- `obsidian_list_notes`: List files in a folder.
- `obsidian_read_note`: Read the full content of a note.

### Graph & Connections
- `obsidian_get_backlinks`: Find all notes that link TO a specific note.
- `obsidian_get_links`: Find all notes linked FROM a specific note.
- `obsidian_get_broken_links`: Find wikilinks that point to missing notes.

### Management & Journaling
- `obsidian_create_note`: Create a new markdown note.
- `obsidian_append_note`: Append text to the end of a note.
- `obsidian_move_note`: Rename or move a note.
- `obsidian_update_frontmatter`: Safely update YAML frontmatter keys in single-key or batch mode.
- `obsidian_replace_section`: Replace the body of a heading without touching the rest of the file.
- `obsidian_insert_at_heading`: Insert content at the beginning or end of a heading section.
- `obsidian_replace_in_note`: Replace the first exact text match in a note for surgical inline edits.
- `obsidian_get_daily_note`: Get or create today's daily note.

## Skills

- `obsidian-companion`: Tool selection and vault workflow guidance.
- `research`: Multi-pass synthesis using RAG and graph traversal.
- `index`: RAG index management.
- `search`: Keyword and filename search.
- `links`: Note connection graph exploration.
- `vault`: Vault and workspace configuration.

## Development

```bash
# Build changes
npm run build
# Type check
npm run type-check
# Run tests
npm test
```

## License

MIT
