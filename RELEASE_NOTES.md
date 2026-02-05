# Release 1.0.3

## Summary
This release fixes an issue where externalized dependencies were missing in fresh installations because they were incorrectly listed in `devDependencies`.

## Bug Fixes
- Moved `@xenova/transformers` to `dependencies` to ensure it is installed alongside the extension.
- Verified that all native and externalized modules are correctly listed for runtime installation.

# Release 1.0.2
...