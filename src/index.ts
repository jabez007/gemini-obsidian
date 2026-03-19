#!/usr/bin/env node

// 1. Defensive check for native dependencies (MUST be first)
try {
    require.resolve('@lancedb/lancedb');
    const ortPackagePath = require.resolve('onnxruntime-node/package.json');
    const ortVersion = require(ortPackagePath).version as string | undefined;
    const isCompatibleOrt = typeof ortVersion === 'string' && /^1\.14(\.|$)/.test(ortVersion);
    if (!isCompatibleOrt) {
      console.error('\n[Gemini Obsidian] Error: Incompatible onnxruntime-node version detected.');
      console.error(`Installed: ${ortVersion ?? 'unknown'}, required: 1.14.x`);
      console.error('This project bundles @xenova/transformers 2.17.x, which requires onnxruntime-node 1.14.x.');
      console.error('Please run:');
      console.error(`  cd ${require('path').join(__dirname, '..')} && npm install onnxruntime-node@1.14.0 --save-exact\n`);
      process.exit(1);
    }
} catch (e) {
    console.error('\n[Gemini Obsidian] Error: Required native dependencies are missing.');
    console.error('This usually happens if "npm install" was not run or failed.');
    console.error('Please run the following command in the extension directory:');
    console.error(`  cd ${require('path').join(__dirname, '..')} && npm install\n`);
    process.exit(1);
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'glob';
import matter from 'gray-matter';
import { VaultIndexer } from './rag/store.js';
import {
  extractWikilinks,
  findSectionRange,
  replaceSection,
  insertAtHeading,
  getSafeFilePath,
  listNotesPattern,
  replaceInNote,
  applyFrontmatterUpdate,
  stripHeadingFromLink,
} from './utils.js';

let VAULT_PATH: string | null = process.env.OBSIDIAN_VAULT_PATH || null;
let WORKSPACE_PATH: string | null = process.env.GEMINI_OBSIDIAN_WORKSPACE_PATH || null;
let VAULT_ID: string | null = process.env.GEMINI_OBSIDIAN_VAULT_ID || null;
let KNOWLEDGE_FOLDERS: string[] = process.env.OBSIDIAN_KNOWLEDGE_FOLDERS ? process.env.OBSIDIAN_KNOWLEDGE_FOLDERS.split(',') : ['Engineering'];
let MOC_FOLDERS: string[] = process.env.OBSIDIAN_MOC_FOLDERS ? process.env.OBSIDIAN_MOC_FOLDERS.split(',') : ['MOCs'];
let DAILY_NOTE_FOLDER: string = process.env.OBSIDIAN_DAILY_NOTE_FOLDER || 'Daily Notes';
let IGNORED_FOLDERS: string[] = process.env.OBSIDIAN_IGNORED_FOLDERS ? process.env.OBSIDIAN_IGNORED_FOLDERS.split(',') : ['Daily Notes'];

const indexer = new VaultIndexer();
const CONFIG_PATH = path.join(os.homedir(), '.gemini-obsidian.config.json');

async function saveConfig(vaultPath: string, workspacePath?: string | null, vaultId?: string | null, knowledgeFolders?: string[], mocFolders?: string[], dailyNoteFolder?: string, ignoredFolders?: string[]) {
    try {
        await fs.writeFile(CONFIG_PATH, JSON.stringify({ 
            vault_path: vaultPath,
            workspace_path: workspacePath || null,
            vault_id: vaultId || null,
            knowledge_folders: knowledgeFolders || KNOWLEDGE_FOLDERS,
            moc_folders: mocFolders || MOC_FOLDERS,
            daily_note_folder: dailyNoteFolder || DAILY_NOTE_FOLDER,
            ignored_folders: ignoredFolders || IGNORED_FOLDERS
        }), 'utf-8');
    } catch (e) { console.error("Failed to save config", e); }
}

async function loadConfig(): Promise<{ 
    vault_path: string | null, 
    workspace_path: string | null, 
    vault_id: string | null,
    knowledge_folders: string[],
    moc_folders: string[],
    daily_note_folder: string,
    ignored_folders: string[]
}> {
    try {
        const data = await fs.readFile(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(data);
        return {
            vault_path: config.vault_path || null,
            workspace_path: config.workspace_path || null,
            vault_id: config.vault_id || null,
            knowledge_folders: config.knowledge_folders || ['Engineering'],
            moc_folders: config.moc_folders || ['MOCs'],
            daily_note_folder: config.daily_note_folder || 'Daily Notes',
            ignored_folders: config.ignored_folders || ['Daily Notes']
        };
    } catch { 
        return { 
            vault_path: null, 
            workspace_path: null, 
            vault_id: null,
            knowledge_folders: ['Engineering'],
            moc_folders: ['MOCs'],
            daily_note_folder: 'Daily Notes',
            ignored_folders: ['Daily Notes']
        }; 
    }
}

/**
 * Helper to validate vault path
 */
function getVaultPath(providedPath?: string): string {
  const p = providedPath || VAULT_PATH;
  if (!p) {
    throw new McpError(ErrorCode.InvalidParams, "Vault path is not set. Use obsidian_set_vault or provide 'vault_path' argument.");
  }
  return p;
}

/**
 * Helper to get workspace path
 */
function getWorkspacePath(providedPath?: string): string | null {
  return providedPath || WORKSPACE_PATH || null;
}

/**
 * Helper to get vault ID
 */
function getVaultId(providedId?: string): string | null {
  return providedId || VAULT_ID || null;
}

async function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            resolve(data);
        });
        process.stdin.on('error', (err) => {
            reject(err);
        });
        // Handle cases where stdin might be empty or already closed
        setTimeout(() => {
            if (data === '') {
                // If no data after 1s, resolve with empty to avoid hang
                resolve('');
            }
        }, 1000);
    });
}

(async () => {
  // Load config and use env vars as overrides
  const config = await loadConfig();
  VAULT_PATH = VAULT_PATH || config.vault_path;
  WORKSPACE_PATH = WORKSPACE_PATH || config.workspace_path;
  VAULT_ID = VAULT_ID || config.vault_id;
  KNOWLEDGE_FOLDERS = process.env.OBSIDIAN_KNOWLEDGE_FOLDERS ? process.env.OBSIDIAN_KNOWLEDGE_FOLDERS.split(',') : config.knowledge_folders;
  MOC_FOLDERS = process.env.OBSIDIAN_MOC_FOLDERS ? process.env.OBSIDIAN_MOC_FOLDERS.split(',') : config.moc_folders;
  DAILY_NOTE_FOLDER = process.env.OBSIDIAN_DAILY_NOTE_FOLDER || config.daily_note_folder;
  IGNORED_FOLDERS = process.env.OBSIDIAN_IGNORED_FOLDERS ? process.env.OBSIDIAN_IGNORED_FOLDERS.split(',') : config.ignored_folders;

  // Handle CLI args for one-shot mode
  const args = process.argv.slice(2);
  
  // If arguments start with a tool name (simple heuristic)
  const knownTools = ['obsidian_list_notes', 'obsidian_read_note', 'obsidian_search_notes', 'obsidian_rag_index', 'obsidian_rag_query', 'obsidian_set_vault', 'obsidian_create_note', 'obsidian_append_note', 'obsidian_get_daily_note', 'obsidian_get_backlinks', 'obsidian_get_links', 'obsidian_move_note', 'obsidian_update_frontmatter', 'obsidian_append_daily_log', 'obsidian_replace_section', 'obsidian_insert_at_heading', 'obsidian_replace_in_note', 'obsidian_get_broken_links', 'validate_frontmatter'];
  
  if (args.length > 0 && knownTools.includes(args[0])) {
    const toolName = args[0];
    const toolArgs = args.slice(1);
    
    const parsedArgs: any = {};
    for (let i = 0; i < toolArgs.length; i++) {
        if (toolArgs[i] && toolArgs[i].startsWith('--')) {
            const key = toolArgs[i].substring(2);
            if (i + 1 < toolArgs.length && !toolArgs[i+1].startsWith('--')) {
                parsedArgs[key] = toolArgs[i+1];
                i++;
            } else {
                parsedArgs[key] = true;
            }
        }
    }

    try {
        let result;
        if (toolName === 'obsidian_list_notes') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const pattern = listNotesPattern(parsedArgs.subfolder ? String(parsedArgs.subfolder) : undefined);
            const files = await glob(pattern, { cwd: vp, follow: true });
            result = JSON.stringify(files.slice(0, 100), null, 2) + (files.length > 100 ? `\n...and ${files.length - 100} more.` : '');
        } else if (toolName === 'obsidian_read_note') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            result = await fs.readFile(filePath, 'utf-8');
        } else if (toolName === 'obsidian_create_note') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            const content = String(parsedArgs.content || '');
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
            result = `Created note: ${parsedArgs.file_path}`;
        } else if (toolName === 'obsidian_append_note') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            const content = String(parsedArgs.content || '');
            await fs.appendFile(filePath, '\n' + content, 'utf-8');
            result = `Appended to note: ${parsedArgs.file_path}`;
        } else if (toolName === 'obsidian_get_daily_note') {
             const vp = getVaultPath(parsedArgs.vault_path);
             const dateStr = new Date().toISOString().split('T')[0];
             const dailyFolder = (await fs.stat(path.join(vp, 'Daily Notes')).catch(() => null)) ? 'Daily Notes' : '';
             const fileName = `${dateStr}.md`;
             const filePath = path.join(vp, dailyFolder, fileName);
             try {
                 result = await fs.readFile(filePath, 'utf-8');
             } catch (e) {
                 await fs.mkdir(path.dirname(filePath), { recursive: true });
                 const content = `# ${dateStr}\n\n`;
                 await fs.writeFile(filePath, content, 'utf-8');
                 result = content;
             }
        } else if (toolName === 'obsidian_search_notes') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const query = String(parsedArgs.query).toLowerCase();
            const files = await glob('**/*.md', { cwd: vp, follow: true });
            const matches: string[] = [];
            for (const f of files) {
                if (f.toLowerCase().includes(query)) {
                     matches.push(f + " (Filename match)"); continue;
                }
                try {
                     const c = await fs.readFile(path.join(vp, f), 'utf-8');
                     if (c.toLowerCase().includes(query)) matches.push(f);
                } catch(e) {}
                if (matches.length >= 20) break;
            }
            result = matches.join('\n');
        } else if (toolName === 'obsidian_rag_index') {
            let vp, fp, wp, hpForce, vid;
            if (parsedArgs.hook) {
                const inputStr = await readStdin();
                if (!inputStr) {
                    process.exit(0);
                }
                const input = JSON.parse(inputStr);
                vp = getVaultPath(input.tool_input?.vault_path || VAULT_PATH);
                fp = input.tool_input?.file_path;
                wp = getWorkspacePath(input.tool_input?.workspace_path || WORKSPACE_PATH);
                vid = getVaultId(input.tool_input?.vault_id || VAULT_ID);
                hpForce = input.tool_input?.force_reindex === true;
                if (!fp) {
                    process.exit(0);
                }
            } else {
                vp = getVaultPath(parsedArgs.vault_path);
                fp = parsedArgs.file_path ? String(parsedArgs.file_path) : null;
                wp = getWorkspacePath(parsedArgs.workspace_path);
                vid = getVaultId(parsedArgs.vault_id);
                hpForce = false;
            }
            const force = parsedArgs.force_reindex === true || parsedArgs.force === true || hpForce;
            let res;
            if (fp) {
                res = await indexer.indexFile(vp, String(fp), wp, vid);
            } else {
                res = await indexer.indexVault(vp, force, wp, vid);
            }
            result = JSON.stringify(res);
        } else if (toolName === 'obsidian_rag_query') {
            const query = String(parsedArgs.query);
            const limit = Number(parsedArgs.limit) || 5;
            const vp = getVaultPath(parsedArgs.vault_path);
            const wp = getWorkspacePath(parsedArgs.workspace_path);
            const vid = getVaultId(parsedArgs.vault_id);
            const res = await indexer.search(query, vp, limit, wp, vid);
            result = res.map((r: any) => `File: ${r.path}\nContent: ${r.text}`).join('\n---\n');
        } else if (toolName === 'obsidian_get_backlinks') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const target = String(parsedArgs.file_name).replace(/\.md$/i, ''); 
            const linkRegex = new RegExp(`\\[\\[${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\]\\|#])`, 'i');
            
            const files = await glob('**/*.md', { cwd: vp, follow: true });
            
            const backlinks: string[] = [];
            const batchSize = 50;
            
            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                await Promise.all(batch.map(async (f) => {
                    try {
                        const content = await fs.readFile(path.join(vp, f), 'utf-8');
                        if (linkRegex.test(content)) {
                            backlinks.push(f);
                        }
                    } catch (e) { }
                }));
            }
            if (backlinks.length === 0) {
                 result = `No backlinks found for "[[${target}]]".`;
            } else {
                 result = `Found ${backlinks.length} backlinks for "[[${target}]]":\n` + backlinks.map(f => `- ${f}`).join('\n');
            }
        } else if (toolName === 'obsidian_get_links') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            const content = await fs.readFile(filePath, 'utf-8');
            result = JSON.stringify(extractWikilinks(content), null, 2);
        } else if (toolName === 'obsidian_move_note') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const source = getSafeFilePath(vp, String(parsedArgs.source_path));
            const dest = getSafeFilePath(vp, String(parsedArgs.dest_path));
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.rename(source, dest);
            result = `Moved ${parsedArgs.source_path} to ${parsedArgs.dest_path}`;
        } else if (toolName === 'obsidian_update_frontmatter') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            const fileContent = await fs.readFile(filePath, 'utf-8');
            let updateArg: Parameters<typeof applyFrontmatterUpdate>[1];
            if (parsedArgs.updates) {
                const updates = typeof parsedArgs.updates === 'string'
                    ? JSON.parse(parsedArgs.updates)
                    : parsedArgs.updates;
                updateArg = { updates };
            } else {
                updateArg = { key: String(parsedArgs.key), value: String(parsedArgs.value) };
            }
            await fs.writeFile(filePath, applyFrontmatterUpdate(fileContent, updateArg), 'utf-8');
            result = `Updated frontmatter in ${parsedArgs.file_path}`;
        } else if (toolName === 'obsidian_replace_section') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            const heading = String(parsedArgs.heading);
            const content = String(parsedArgs.content);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const range = findSectionRange(fileContent, heading);
            if (!range) throw new Error(`Heading "${heading}" not found in ${parsedArgs.file_path}`);
            await fs.writeFile(filePath, replaceSection(fileContent, range, content), 'utf-8');
            result = `Replaced section "${heading}" in ${parsedArgs.file_path}`;
        } else if (toolName === 'obsidian_insert_at_heading') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            const heading = String(parsedArgs.heading);
            const content = String(parsedArgs.content);
            const position = (parsedArgs.position || 'end') as 'beginning' | 'end';
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const range = findSectionRange(fileContent, heading);
            await fs.writeFile(filePath, insertAtHeading(fileContent, heading, content, position, range), 'utf-8');
            result = `Inserted content under "${heading}" in ${parsedArgs.file_path}`;
        } else if (toolName === 'obsidian_append_daily_log') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const heading = String(parsedArgs.heading);
            const content = String(parsedArgs.content);
            const dateStr = new Date().toISOString().split('T')[0];
            const dailyFolder = (await fs.stat(path.join(vp, 'Daily Notes')).catch(() => null)) ? 'Daily Notes' : '';
            const fileName = `${dateStr}.md`;
            const filePath = path.join(vp, dailyFolder, fileName);
            let fileContent = '';
            try { fileContent = await fs.readFile(filePath, 'utf-8'); } catch (e) {
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                fileContent = `# ${dateStr}\n\n`;
            }
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const entry = `\n- [${timestamp}] ${content}`;
            const range = findSectionRange(fileContent, heading);
            if (range) {
                fileContent = fileContent.slice(0, range.headingEnd) + entry + fileContent.slice(range.headingEnd);
            } else {
                fileContent += `\n\n## ${heading}${entry}`;
            }
            await fs.writeFile(filePath, fileContent, 'utf-8');
            result = `Appended to daily note under "${heading}"`;
        } else if (toolName === 'obsidian_replace_in_note') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const filePath = getSafeFilePath(vp, String(parsedArgs.file_path));
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const updated = replaceInNote(fileContent, String(parsedArgs.old_text), String(parsedArgs.new_text ?? ''));
            await fs.writeFile(filePath, updated, 'utf-8');
            result = `Replaced text in ${parsedArgs.file_path}`;
        } else if (toolName === 'obsidian_get_broken_links') {
            const vp = getVaultPath(parsedArgs.vault_path);
            const pattern = listNotesPattern(parsedArgs.subfolder ? String(parsedArgs.subfolder) : undefined);
            const files = await glob(pattern, { cwd: vp, follow: true });
            const allFiles = await glob('**/*.md', { cwd: vp, follow: true });
            const nameSet = new Set(allFiles.map((f: string) => path.basename(f, '.md').toLowerCase()));
            const targetMap = new Map<string, string[]>();
            for (const f of files) {
                const content = await fs.readFile(path.join(vp, f), 'utf-8').catch(() => '');
                for (const link of extractWikilinks(content)) {
                    const target = stripHeadingFromLink(link);
                    if (!target) continue;
                    const refs = targetMap.get(target) ?? [];
                    refs.push(f);
                    targetMap.set(target, refs);
                }
            }
            const broken: Array<{ target: string; refs: string[] }> = [];
            for (const [target, refs] of targetMap) {
                if (!nameSet.has(target.toLowerCase())) {
                    broken.push({ target, refs });
                }
            }
            result = broken.length === 0
                ? 'No broken links found.'
                : `Found ${broken.length} broken link(s):\n${broken.map((entry) => `[[${entry.target}]] — in: ${entry.refs.join(', ')}`).join('\n')}`;
        } else if (toolName === 'validate_frontmatter') {
            if (!parsedArgs.hook) {
                process.exit(0);
            }
            const inputStr = await readStdin();
            if (!inputStr) {
                process.exit(0);
            }
            let input: any;
            try {
                input = JSON.parse(inputStr);
            } catch {
                process.exit(0);
            }

            const filePath = String(input.tool_input?.file_path ?? '');
            const content = String(input.tool_input?.content ?? '');
            if (!filePath || !content) {
                process.exit(0);
            }

            let vp: string;
            try {
                vp = getVaultPath(input.tool_input?.vault_path || undefined);
            } catch {
                process.exit(0);
            }

            const schemaPaths = [
                path.join(vp, '.gemini-obsidian-schema.json'),
                path.join(vp, '.obsidian-rag-schema.json'),
            ];

            let schema: { rules: Array<{ prefix: string; required: string[] }> } | undefined;
            for (const schemaPath of schemaPaths) {
                try {
                    schema = JSON.parse(await fs.readFile(schemaPath, 'utf-8'));
                    break;
                } catch {
                    // Try the next schema path.
                }
            }
            if (!schema) {
                process.exit(0);
            }

            const matchingRule = (schema.rules ?? []).find((rule) => filePath.startsWith(rule.prefix));
            if (!matchingRule) {
                process.exit(0);
            }

            const parsed = matter(content);
            const missing = matchingRule.required.filter((field) => !(field in parsed.data));
            if (missing.length > 0) {
                console.error(
                    `[gemini-obsidian] Blocked: "${filePath}" is missing required frontmatter fields: ${missing.join(', ')}`
                );
                process.exit(2);
            }
            process.exit(0);
        } else if (toolName === 'obsidian_set_vault') {
            const vp = String(parsedArgs.path || parsedArgs.vault_path || '');
            if ('workspace_path' in parsedArgs) {
                WORKSPACE_PATH = parsedArgs.workspace_path ? String(parsedArgs.workspace_path) : null;
            }
            if ('vault_id' in parsedArgs || 'id' in parsedArgs) {
                VAULT_ID = (parsedArgs.vault_id || parsedArgs.id) ? String(parsedArgs.vault_id || parsedArgs.id) : null;
            }
            if ('primary_knowledge_folder' in parsedArgs) {
                PRIMARY_KNOWLEDGE_FOLDER = String(parsedArgs.primary_knowledge_folder);
            }
            if ('moc_folder' in parsedArgs) {
                MOC_FOLDER = String(parsedArgs.moc_folder);
            }
            if ('ignored_folders' in parsedArgs) {
                IGNORED_FOLDERS = String(parsedArgs.ignored_folders).split(',');
            }
            VAULT_PATH = vp;
            await indexer.reset();
            await saveConfig(VAULT_PATH, WORKSPACE_PATH, VAULT_ID, PRIMARY_KNOWLEDGE_FOLDER, MOC_FOLDER, IGNORED_FOLDERS);
            result = `Vault path set to: ${vp}`;
        } else if (toolName === 'obsidian_get_config') {
            result = JSON.stringify({
                vault_path: VAULT_PATH,
                workspace_path: WORKSPACE_PATH,
                vault_id: VAULT_ID,
                primary_knowledge_folder: PRIMARY_KNOWLEDGE_FOLDER,
                moc_folder: MOC_FOLDER,
                ignored_folders: IGNORED_FOLDERS
            }, null, 2);
        }
 else {
            console.error(`Unknown tool: ${toolName}`);
            process.exit(1);
        }
        if (result !== undefined) {
            console.log(result);
            process.exit(0);
        }
        process.exit(1);
    } catch (error: any) {
        console.error(error.message);
        process.exit(1);
    }
  }

  // MCP Server Mode
  const server = new Server(
    {
      name: 'gemini-obsidian',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'obsidian_set_vault',
          description: 'Set the default Obsidian vault path and optional structure/ID for this session.',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute path to the Obsidian vault' },
              workspace_path: { type: 'string', description: 'Optional absolute path to the workspace root where .gemini-obsidian should be created.' },
              vault_id: { type: 'string', description: 'Optional unique identifier for this vault to share metadata across machines.' },
              knowledge_folders: { type: 'array', items: { type: 'string' }, description: 'Folders for global knowledge notes (e.g., ["WORK", "LIFE"])' },
              moc_folders: { type: 'array', items: { type: 'string' }, description: 'Folders where Maps of Content (MOCs) or Bases are stored (e.g., ["_SYS"])' },
              daily_note_folder: { type: 'string', description: 'Folder where daily notes are stored (e.g., "JRNL")' },
              ignored_folders: { type: 'array', items: { type: 'string' }, description: 'List of folders to ignore during audits/scans (e.g., ["JRNL", "Archive"])' },
            },
            required: ['path'],
          },
        },
        {
          name: 'obsidian_get_config',
          description: 'Get the current vault configuration (paths, folders, etc.).',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'obsidian_list_notes',
          description: 'List markdown files in the vault or a subdirectory.',
          inputSchema: {
            type: 'object',
            properties: {
              subfolder: { type: 'string', description: 'Optional subfolder to list' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
          },
        },
        {
          name: 'obsidian_read_note',
          description: 'Read the content of a specific note (Markdown).',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path to the note' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'obsidian_create_note',
          description: 'Create a new note with the given content.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path for the new note (e.g. "Ideas/MyIdea.md")' },
              content: { type: 'string', description: 'Initial content of the note' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path', 'content'],
          },
        },
        {
          name: 'obsidian_append_note',
          description: 'Append text to the end of an existing note.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path to the note' },
              content: { type: 'string', description: 'Text to append' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path', 'content'],
          },
        },
        {
          name: 'obsidian_get_daily_note',
          description: 'Get (or create) today\'s daily note.',
          inputSchema: {
            type: 'object',
            properties: {
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
          },
        },
        {
          name: 'obsidian_search_notes',
          description: 'Search for notes containing specific text (simple text match).',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Text to search for' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['query'],
          },
        },
        {
          name: 'obsidian_rag_index',
          description: 'Index the vault for semantic search (RAG). If file_path is provided, only that file is re-indexed. Incremental by default — only re-embeds changed files. Use force_reindex to rebuild from scratch.',
          inputSchema: {
            type: 'object',
            properties: {
              vault_path: { type: 'string', description: 'Optional vault path override' },
              workspace_path: { type: 'string', description: 'Optional workspace path override' },
              vault_id: { type: 'string', description: 'Optional unique identifier for the vault' },
              file_path: { type: 'string', description: 'Relative path to a specific note to re-index' },
              force_reindex: { type: 'boolean', description: 'Force full re-index, ignoring cached file hashes (default: false)' },
            },
          },
        },
        {
          name: 'obsidian_rag_query',
          description: 'Perform a semantic search on the indexed vault.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Question or query to ask your notes' },
              limit: { type: 'number', description: 'Number of chunks to retrieve (default 5)' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
              workspace_path: { type: 'string', description: 'Optional workspace path override' },
              vault_id: { type: 'string', description: 'Optional unique identifier for the vault' },
            },
            required: ['query'],
          },
        },
        {
          name: 'obsidian_get_backlinks',
          description: 'Find all notes that link to a specific note.',
          inputSchema: {
            type: 'object',
            properties: {
              file_name: { type: 'string', description: 'Name of the note to find backlinks for (without extension)' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_name'],
          },
        },
        {
          name: 'obsidian_get_links',
          description: 'Get all outgoing links from a specific note.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path to the note' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'obsidian_move_note',
          description: 'Move or rename a note.',
          inputSchema: {
            type: 'object',
            properties: {
              source_path: { type: 'string', description: 'Current relative path of the note' },
              dest_path: { type: 'string', description: 'New relative path for the note (e.g. "Archive/OldNote.md")' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['source_path', 'dest_path'],
          },
        },
        {
          name: 'obsidian_update_frontmatter',
          description: 'Update YAML frontmatter of a note safely. Supports single key/value or batch updates.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path to the note' },
              key: { type: 'string', description: 'Frontmatter key to update (single-key mode)' },
              value: { type: 'string', description: 'New value for the key (JSON stringified if array/object; single-key mode)' },
              updates: { type: 'object', description: 'JSON object of key/value pairs to set at once (batch mode, alternative to key+value)' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'obsidian_append_daily_log',
          description: 'Append text to a specific heading in today\'s daily note.',
          inputSchema: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'Heading to append under (e.g., "Work Log", "Ideas")' },
              content: { type: 'string', description: 'Text to append' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['heading', 'content'],
          },
        },
        {
          name: 'obsidian_replace_section',
          description: 'Replace the body under a heading (up to the next heading of equal/higher level, or EOF). The heading line itself is preserved.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path to the note' },
              heading: { type: 'string', description: 'Heading text to find (e.g. "Status")' },
              content: { type: 'string', description: 'New section body (replaces everything between heading and next same/higher-level heading)' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path', 'heading', 'content'],
          },
        },
        {
          name: 'obsidian_insert_at_heading',
          description: 'Insert content under a specific heading. If heading not found, appends it as a new ## section.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path to the note' },
              heading: { type: 'string', description: 'Heading text to find (e.g. "Notes")' },
              content: { type: 'string', description: 'Text to insert' },
              position: { type: 'string', enum: ['beginning', 'end'], description: 'Insert at beginning or end of section (default: end)' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path', 'heading', 'content'],
          },
        },
        {
          name: 'obsidian_replace_in_note',
          description: 'Replace the first occurrence of a specific text string in a note. Use for surgical inline edits, e.g. adding a wikilink to existing text.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Relative path to the note' },
              old_text: { type: 'string', description: 'Exact text to find and replace' },
              new_text: { type: 'string', description: 'Replacement text (default: empty string)' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
            required: ['file_path', 'old_text'],
          },
        },
        {
          name: 'obsidian_get_broken_links',
          description: 'Find all wikilinks in the vault (or a subfolder) that point to non-existent notes. Returns broken links grouped by source file.',
          inputSchema: {
            type: 'object',
            properties: {
              subfolder: { type: 'string', description: 'Limit scan to this subfolder (optional; default: entire vault)' },
              vault_path: { type: 'string', description: 'Optional vault path override' },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (name === 'obsidian_set_vault') {
          VAULT_PATH = String(args?.path);
          if (args && 'workspace_path' in args) {
              WORKSPACE_PATH = args.workspace_path ? String(args.workspace_path) : null;
          }
          if (args && 'vault_id' in args) {
              VAULT_ID = args.vault_id ? String(args.vault_id) : null;
          }
          if (args && 'knowledge_folders' in args && Array.isArray(args.knowledge_folders)) {
              KNOWLEDGE_FOLDERS = args.knowledge_folders as string[];
          }
          if (args && 'moc_folders' in args && Array.isArray(args.moc_folders)) {
              MOC_FOLDERS = args.moc_folders as string[];
          }
          if (args && 'daily_note_folder' in args) {
              DAILY_NOTE_FOLDER = String(args.daily_note_folder);
          }
          if (args && 'ignored_folders' in args && Array.isArray(args.ignored_folders)) {
              IGNORED_FOLDERS = args.ignored_folders as string[];
          }
          await indexer.reset();
          await saveConfig(VAULT_PATH, WORKSPACE_PATH, VAULT_ID, KNOWLEDGE_FOLDERS, MOC_FOLDERS, DAILY_NOTE_FOLDER, IGNORED_FOLDERS);
          return { content: [{ type: 'text', text: `Vault path set to: ${VAULT_PATH}` }] };
      }
      if (name === 'obsidian_get_config') {
          return { content: [{ type: 'text', text: JSON.stringify({
              vault_path: VAULT_PATH,
              workspace_path: WORKSPACE_PATH,
              vault_id: VAULT_ID,
              knowledge_folders: KNOWLEDGE_FOLDERS,
              moc_folders: MOC_FOLDERS,
              daily_note_folder: DAILY_NOTE_FOLDER,
              ignored_folders: IGNORED_FOLDERS
          }, null, 2) }] };
      }
      if (name === 'obsidian_list_notes') {
          const vp = getVaultPath(args?.vault_path as string);
          const pattern = listNotesPattern(args?.subfolder ? String(args.subfolder) : undefined);
          const files = await glob(pattern, { cwd: vp, follow: true });
          return { content: [{ type: 'text', text: JSON.stringify(files.slice(0, 100), null, 2) + (files.length > 100 ? `\n...and ${files.length - 100} more.` : '') }] };
      }
      if (name === 'obsidian_read_note') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const content = await fs.readFile(filePath, 'utf-8');
          return { content: [{ type: 'text', text: content }] };
      }
      if (name === 'obsidian_create_note') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const content = String(args?.content || '');
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content, 'utf-8');
          return { content: [{ type: 'text', text: `Created note: ${args?.file_path}` }] };
      }
      if (name === 'obsidian_append_note') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const content = String(args?.content || '');
          await fs.appendFile(filePath, '\n' + content, 'utf-8');
          return { content: [{ type: 'text', text: `Appended to note: ${args?.file_path}` }] };
      }
      if (name === 'obsidian_get_daily_note') {
           const vp = getVaultPath(args?.vault_path as string);
           const dateStr = new Date().toISOString().split('T')[0];
           const dailyFolder = (await fs.stat(path.join(vp, DAILY_NOTE_FOLDER)).catch(() => null)) ? DAILY_NOTE_FOLDER : '';
           const fileName = `${dateStr}.md`;
           const filePath = path.join(vp, dailyFolder, fileName);
           let content = '';
           try {
               content = await fs.readFile(filePath, 'utf-8');
           } catch (e) {
               await fs.mkdir(path.dirname(filePath), { recursive: true });
               content = `# ${dateStr}\n\n`;
               await fs.writeFile(filePath, content, 'utf-8');
           }
           return { content: [{ type: 'text', text: content }] };
      }
      if (name === 'obsidian_search_notes') {
          const vp = getVaultPath(args?.vault_path as string);
          const query = String(args?.query).toLowerCase();
          const files = await glob('**/*.md', { cwd: vp, follow: true });
          const matches: string[] = [];
          for (const f of files) {
              if (f.toLowerCase().includes(query)) {
                  matches.push(f + " (Filename match)"); continue;
              }
              try {
                  const content = await fs.readFile(path.join(vp, f), 'utf-8');
                  if (content.toLowerCase().includes(query)) matches.push(f);
              } catch (e) { } 
              if (matches.length >= 20) break;
          }
          return { content: [{ type: 'text', text: matches.join('\n') }] };
      }
      if (name === 'obsidian_rag_index') {
          const vp = getVaultPath(args?.vault_path as string);
          const wp = getWorkspacePath(args?.workspace_path as string);
          const vid = getVaultId(args?.vault_id as string);
          const fp = args?.file_path ? String(args.file_path) : null;
          const force = args?.force_reindex === true;
          let result;
          if (fp) {
              result = await indexer.indexFile(vp, fp, wp, vid);
          } else {
              result = await indexer.indexVault(vp, force, wp, vid);
          }
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      if (name === 'obsidian_rag_query') {
          const query = String(args?.query);
          const limit = Number(args?.limit) || 5;
          const vp = getVaultPath(args?.vault_path as string);
          const wp = getWorkspacePath(args?.workspace_path as string);
          const vid = getVaultId(args?.vault_id as string);
          const results = await indexer.search(query, vp, limit, wp, vid);
          const formatted = results.map((r: any) =>
              `---\nFile: ${r.path}\nRelevance: ${r._distance}\nContent: ${r.text}\n---`
          ).join('\n');
          return { content: [{ type: 'text', text: formatted }] };
      }

      if (name === 'obsidian_get_backlinks') {
          const vp = getVaultPath(args?.vault_path as string);
          const target = String(args?.file_name).replace(/\.md$/i, ''); 
          const linkRegex = new RegExp(`\\[\\[${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\]\\|#])`, 'i');
          
          const files = await glob('**/*.md', { cwd: vp, follow: true });
          
          // Parallel processing with simple concurrency control (batches of 50)
          const backlinks: string[] = [];
          const batchSize = 50;
          
          for (let i = 0; i < files.length; i += batchSize) {
              const batch = files.slice(i, i + batchSize);
              await Promise.all(batch.map(async (f) => {
                  try {
                      const content = await fs.readFile(path.join(vp, f), 'utf-8');
                      if (linkRegex.test(content)) {
                          backlinks.push(f);
                      }
                  } catch (e) { }
              }));
          }
          
          if (backlinks.length === 0) {
               return { content: [{ type: 'text', text: `No backlinks found for "[[${target}]]".` }] };
          }
          return { content: [{ type: 'text', text: `Found ${backlinks.length} backlinks for "[[${target}]]":\n` + backlinks.map(f => `- ${f}`).join('\n') }] };
      }
      if (name === 'obsidian_get_links') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const content = await fs.readFile(filePath, 'utf-8');
          return { content: [{ type: 'text', text: JSON.stringify(extractWikilinks(content), null, 2) }] };
      }
      if (name === 'obsidian_move_note') {
          const vp = getVaultPath(args?.vault_path as string);
          const source = getSafeFilePath(vp, String(args?.source_path));
          const dest = getSafeFilePath(vp, String(args?.dest_path));
          
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.rename(source, dest);
          return { content: [{ type: 'text', text: `Moved ${args?.source_path} to ${args?.dest_path}` }] };
      }
      if (name === 'obsidian_update_frontmatter') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const updateArg = (args?.updates && typeof args.updates === 'object')
              ? { updates: args.updates as Record<string, unknown> }
              : { key: String(args?.key), value: String(args?.value) };
          await fs.writeFile(filePath, applyFrontmatterUpdate(fileContent, updateArg), 'utf-8');
          return { content: [{ type: 'text', text: `Updated frontmatter in ${args?.file_path}` }] };
      }
      if (name === 'obsidian_replace_section') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const heading = String(args?.heading);
          const content = String(args?.content);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const range = findSectionRange(fileContent, heading);
          if (!range) throw new McpError(ErrorCode.InvalidParams, `Heading "${heading}" not found in ${args?.file_path}`);
          await fs.writeFile(filePath, replaceSection(fileContent, range, content), 'utf-8');
          return { content: [{ type: 'text', text: `Replaced section "${heading}" in ${args?.file_path}` }] };
      }
      if (name === 'obsidian_insert_at_heading') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const heading = String(args?.heading);
          const content = String(args?.content);
          const position = (args?.position || 'end') as 'beginning' | 'end';
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const range = findSectionRange(fileContent, heading);
          await fs.writeFile(filePath, insertAtHeading(fileContent, heading, content, position, range), 'utf-8');
          return { content: [{ type: 'text', text: `Inserted content under "${heading}" in ${args?.file_path}` }] };
      }
      if (name === 'obsidian_append_daily_log') {
          const vp = getVaultPath(args?.vault_path as string);
          const heading = String(args?.heading);
          const content = String(args?.content);

          const dateStr = new Date().toISOString().split('T')[0];
          const dailyFolder = (await fs.stat(path.join(vp, DAILY_NOTE_FOLDER)).catch(() => null)) ? DAILY_NOTE_FOLDER : '';
          const fileName = `${dateStr}.md`;
          const filePath = path.join(vp, dailyFolder, fileName);

          let fileContent = '';
          try {
              fileContent = await fs.readFile(filePath, 'utf-8');
          } catch (e) {
              await fs.mkdir(path.dirname(filePath), { recursive: true });
              fileContent = `# ${dateStr}\n\n`;
          }

          const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const entry = `\n- [${timestamp}] ${content}`;
          const range = findSectionRange(fileContent, heading);

          if (range) {
              fileContent = fileContent.slice(0, range.headingEnd) + entry + fileContent.slice(range.headingEnd);
          } else {
              fileContent += `\n\n## ${heading}${entry}`;
          }

          await fs.writeFile(filePath, fileContent, 'utf-8');
          return { content: [{ type: 'text', text: `Appended to daily note under "${heading}"` }] };
      }
      if (name === 'obsidian_replace_in_note') {
          const vp = getVaultPath(args?.vault_path as string);
          const filePath = getSafeFilePath(vp, String(args?.file_path));
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const updated = replaceInNote(fileContent, String(args?.old_text), String(args?.new_text ?? ''));
          await fs.writeFile(filePath, updated, 'utf-8');
          return { content: [{ type: 'text', text: `Replaced text in ${args?.file_path}` }] };
      }
      if (name === 'obsidian_get_broken_links') {
          const vp = getVaultPath(args?.vault_path as string);
          const pattern = listNotesPattern(args?.subfolder ? String(args.subfolder) : undefined);
          const files = await glob(pattern, { cwd: vp, follow: true });
          const allFiles = await glob('**/*.md', { cwd: vp, follow: true });
          const nameSet = new Set(allFiles.map((f: string) => path.basename(f, '.md').toLowerCase()));
          const targetMap = new Map<string, string[]>();
          for (const f of files) {
              const content = await fs.readFile(path.join(vp, f), 'utf-8').catch(() => '');
              for (const link of extractWikilinks(content)) {
                  const target = stripHeadingFromLink(link);
                  if (!target) continue;
                  const refs = targetMap.get(target) ?? [];
                  refs.push(f);
                  targetMap.set(target, refs);
              }
          }
          const broken: Array<{ target: string; refs: string[] }> = [];
          for (const [target, refs] of targetMap) {
              if (!nameSet.has(target.toLowerCase())) {
                  broken.push({ target, refs });
              }
          }
          if (broken.length === 0) {
              return { content: [{ type: 'text', text: 'No broken links found.' }] };
          }
          const lines = broken.map((entry) => `[[${entry.target}]] — in: ${entry.refs.join(', ')}`).join('\n');
          return { content: [{ type: 'text', text: `Found ${broken.length} broken link(s):\n${lines}` }] };
      }
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${error.message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
