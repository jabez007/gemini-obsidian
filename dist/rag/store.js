"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultIndexer = void 0;
const lancedb = __importStar(require("@lancedb/lancedb"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
const gray_matter_1 = __importDefault(require("gray-matter"));
const md5_1 = __importDefault(require("md5"));
const embedder_js_1 = require("./embedder.js");
const DB_PATH = '.gemini-obsidian-lancedb';
class VaultIndexer {
    db = null;
    table = null;
    constructor() { }
    async getDb() {
        if (!this.db) {
            this.db = await lancedb.connect(DB_PATH);
        }
        return this.db;
    }
    async getTable() {
        const db = await this.getDb();
        const tableNames = await db.tableNames();
        if (tableNames.includes('notes')) {
            this.table = await db.openTable('notes');
        }
        return this.table;
    }
    async createOrGetTable(data) {
        const db = await this.getDb();
        const tableNames = await db.tableNames();
        if (tableNames.includes('notes')) {
            this.table = await db.openTable('notes');
            if (data && data.length > 0) {
                await this.table.add(data);
            }
        }
        else {
            if (!data || data.length === 0) {
                // Cannot create empty table easily without schema in some versions, 
                // but let's wait until we have data.
                return null;
            }
            this.table = await db.createTable('notes', data);
        }
        return this.table;
    }
    async indexVault(vaultPath) {
        const embedder = embedder_js_1.Embedder.getInstance();
        // 1. Find all markdown files
        const files = await (0, glob_1.glob)('**/*.md', { cwd: vaultPath, absolute: true });
        console.error(`Found ${files.length} notes in ${vaultPath}`);
        const chunks = [];
        for (const filePath of files) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const { data, content: body } = (0, gray_matter_1.default)(content);
                // Simple chunking by paragraphs for now
                // A better approach would be recursive character text splitter or header-based
                const relativePath = path.relative(vaultPath, filePath);
                const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                for (let i = 0; i < paragraphs.length; i++) {
                    const text = paragraphs[i].trim();
                    if (text.length < 20)
                        continue; // Skip very short chunks
                    // Include metadata in embedding context if useful, but here we just embed text
                    // We prepend title/path to context for better retrieval
                    const context = `File: ${relativePath}\nContent: ${text}`;
                    try {
                        const vector = await embedder.embed(context);
                        chunks.push({
                            id: (0, md5_1.default)(`${relativePath}-${i}`),
                            path: relativePath,
                            text: text,
                            vector: vector
                        });
                    }
                    catch (err) {
                        console.error(`Failed to embed chunk in ${relativePath}:`, err);
                    }
                }
            }
            catch (err) {
                console.error(`Failed to process file ${filePath}:`, err);
                continue;
            }
        }
        if (chunks.length > 0) {
            // Drop existing table to full re-index (simplest for now)
            const db = await this.getDb();
            try {
                await db.dropTable('notes');
            }
            catch (e) { /* ignore if not exists */ }
            await this.createOrGetTable(chunks);
            console.error(`Indexed ${chunks.length} chunks.`);
            return { success: true, chunks: chunks.length };
        }
        else {
            return { success: false, message: "No content found to index." };
        }
    }
    async search(query, limit = 5) {
        const table = await this.getTable();
        if (!table) {
            return [];
        }
        const embedder = embedder_js_1.Embedder.getInstance();
        const vector = await embedder.embed(query);
        const results = await table.vectorSearch(vector)
            .limit(limit)
            .toArray();
        return results;
    }
}
exports.VaultIndexer = VaultIndexer;
