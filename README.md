# Gemini Obsidian Extension

This is a powerful [Gemini CLI](https://github.com/google/gemini-cli) extension that integrates your **Obsidian Vault** directly into your AI workflow. It transforms Gemini into a "Second Brain" assistant capable of reading, searching, connecting, and managing your notes.

## Features

- **🧠 Semantic Search (RAG)**: Ask natural language questions about your notes. The extension indexes your vault using embeddings (via LanceDB) to find relevant context.
- **🕸️ Graph Traversal**: Navigate your knowledge graph. Find backlinks (`[[linked from]]`) and outgoing links to surf your ideas.
- **📝 Smart Journaling**: Fetch today's daily note or append logs to specific headings (e.g., `## Work Log`) with timestamps.
- **⚡ Management**: Create, move, rename notes, and safely update YAML frontmatter without breaking formatting.
- **🔍 Fuzzy Search**: Quickly find files by name or content.

## Demo

![demo.gif](docs/demo.gif)

## Prerequisites

- **Node.js**: v18 or higher.
- **Gemini CLI**: The host application for this extension.
- **Obsidian Vault**: A local folder containing your markdown notes.

## Installation

1. **Install via Gemini CLI**:
   ```sh
   gemini extensions install https://github.com/thoreinstein/gemini-obsidian
   ```

2. **Install Native Dependencies**:
   This extension requires native binaries for semantic search. You **must** run `npm install` inside the extension directory:
   ```sh
   cd ~/.gemini/extensions/gemini-obsidian && npm install
   ```

## Configuration

The extension needs to know where your Obsidian vault is located.

**Option 1: Environment Variables**
Set these in your shell profile:
```bash
export OBSIDIAN_VAULT_PATH="/Users/you/Documents/MyVault"
# Optional: Set a dedicated workspace for .gemini-obsidian metadata
export GEMINI_OBSIDIAN_WORKSPACE_PATH="/Users/you/Documents/MyProject"
```

**Option 2: Runtime Configuration**
The first time you use a tool, gemini will ask to set `vault_path`. It will be cached in `~/.gemini-obsidian.config.json`. You can also set a `workspace_path` to keep the vector index outside your vault but still in a specific project folder.

## Data Storage & Troubleshooting

- **Vector Index & Hashes**: 
  - If a **workspace path** is configured, metadata is stored in `<workspace_path>/.gemini-obsidian/vaults/<hash_of_vault_path>/`.
  - Otherwise, it defaults to a **Hashed Global Cache** in `~/.gemini-obsidian/vaults/<hash_of_vault_path>/`. This keeps your Obsidian vault "clean" (Obsidian won't try to parse the binary database) and allows multiple vaults to have isolated indices.
- **Cache Reset**: If you suspect the index is corrupted or want a fresh start, you can manually delete the vault-specific folder (`.gemini-obsidian/vaults/<hash_of_vault_path>`) in your workspace or the corresponding entry in the global cache. The next time you run `/obsidian:index` or `obsidian_rag_index`, it will be recreated.
- **Module Not Found Error**: If you see an error like `Cannot find module '@lancedb/lancedb'`, it means the native dependencies were not installed. Run `npm install` in the extension directory as shown in the Installation section.
- **Logs**: If you encounter issues, check the extension logs. Since this runs as an MCP server, errors are typically output to stderr.

## Indexing Performance Tuning

> [!WARNING]
> Initial semantic indexing can be time- and resource-intensive, especially on large vaults.
> For first-time indexing on larger vaults, prefer running indexing directly from the extension directory (outside an active Gemini chat session):
> `node dist/index.js obsidian_rag_index`

### Initial Indexing Expectations

- Recommended threshold for one-time CLI indexing: vaults with roughly `500+` markdown files.
- CPU usage can stay high for the full indexing run (multiple cores active).
- In a real-world test with `~1000` files (`957` notes), indexing produced `13,296` chunks and took about `11 minutes` (`11:01`, ~`374%` CPU).

For large vaults, you can tune indexing throughput and chunk size with environment variables:

- `GEMINI_OBSIDIAN_EMBED_BATCH_SIZE` (default: `48`): Number of chunks embedded per batch.
- `GEMINI_OBSIDIAN_MIN_CHUNK_CHARS` (default: `40`): Skip very small chunks below this size.
- `GEMINI_OBSIDIAN_MAX_CHUNK_CHARS` (default: `1800`): Split oversized paragraphs into smaller embedding-safe segments.
- `GEMINI_OBSIDIAN_TARGET_CHUNK_CHARS` (default: `700`): Merge nearby short segments into larger chunks to reduce total embeddings.

Higher `GEMINI_OBSIDIAN_TARGET_CHUNK_CHARS` generally improves indexing speed by reducing chunk count, but can reduce retrieval granularity.

Example preset for very large vaults:

```bash
GEMINI_OBSIDIAN_EMBED_BATCH_SIZE=48 \
GEMINI_OBSIDIAN_TARGET_CHUNK_CHARS=900 \
GEMINI_OBSIDIAN_MIN_CHUNK_CHARS=60 \
node dist/index.js obsidian_rag_index
```

## Commands

The extension comes with pre-configured slash commands for common workflows:

| Command | Description |
| :--- | :--- |
| `/obsidian:daily` | Retrieve today's daily note, summarize tasks, and ask for updates. |
| `/obsidian:ask` | Ask a question to your vault using RAG (e.g., `/obsidian:ask "What did I learn about React?"`). |
| `/obsidian:search` | Fuzzy search for files by name or content. |
| `/obsidian:index` | Trigger a manual re-index of the vault for semantic search. |

## Available Tools

The following tools are exposed to the Gemini agent:

### Retrieval & Search
- `obsidian_rag_index`: Index the vault for semantic search.
- `obsidian_rag_query`: Perform a semantic search query.
- `obsidian_search_notes`: Simple text/filename search.
- `obsidian_list_notes`: List files in a folder.
- `obsidian_read_note`: Read the full content of a note.

### Graph & Connections
- `obsidian_get_backlinks`: Find all notes that link TO a specific note.
- `obsidian_get_links`: Find all notes linked FROM a specific note.

### Management & Journaling
- `obsidian_create_note`: Create a new markdown note.
- `obsidian_append_note`: Append text to the end of a note.
- `obsidian_append_daily_log`: Append text to a specific heading (e.g., "Log") in today's daily note with a timestamp.
- `obsidian_move_note`: Rename or move a note.
- `obsidian_update_frontmatter`: Safely update YAML frontmatter keys.
- `obsidian_get_daily_note`: Get or create today's daily note.

## Development

```bash
# Build changes
npm run build

# Watch mode
npm run watch
```

## License

ISC
