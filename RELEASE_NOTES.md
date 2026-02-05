# Release 1.0.5

## Summary
This release focuses on robustness and self-containment. It fixes the "Connection closed" errors by properly bundling transformers and adds defensive checks for native dependencies.

## Bug Fixes
- **Bundling:** `@xenova/transformers` is now bundled into the main script. A shim for `import.meta.url` was added to resolve path issues in CommonJS.
- **Diagnostics:** Added a startup check that detects if `@lancedb/lancedb` is missing from `node_modules` and provides clear instructions on how to fix it.
- **Consistency:** LanceDB storage is now explicitly absolute (`~/.gemini-obsidian-lancedb`).

## Operations
- Users may need to run `npm install` in the extension directory if they see the new "dependency missing" error.

# Release 1.0.4
...