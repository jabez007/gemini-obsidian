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

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/gemini-obsidian.git
    cd gemini-obsidian
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    npm run build
    ```

3.  **Link to Gemini CLI**:
    ```bash
    # From within the project directory
    gemini install .
    ```

## Configuration

The extension needs to know where your Obsidian vault is located.

**Option 1: Environment Variable**
Set `OBSIDIAN_VAULT_PATH` in your shell profile:
```bash
export OBSIDIAN_VAULT_PATH="/Users/you/Documents/MyVault"
```

**Option 2: Runtime Configuration**
The first time you use a tool, you can provide the `vault_path`. It will be cached in `~/.gemini-obsidian.config.json`.

You can also set it explicitly via the tool:
```
/run obsidian_set_vault path="/Users/you/Documents/MyVault"
```

## Data Storage & Troubleshooting

- **Vector Index**: The semantic search index is stored locally in a `.gemini-obsidian-lancedb` folder within the extension directory.
- **Cache Reset**: If you suspect the index is corrupted or want a fresh start, you can manually delete the `.gemini-obsidian-lancedb` folder. The next time you run `/obsidian:index` or `obsidian_rag_index`, it will be recreated.
- **Logs**: If you encounter issues, check the extension logs. Since this runs as an MCP server, errors are typically output to stderr.

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
