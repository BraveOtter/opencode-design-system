# Repository instructions

- This repository is the `opencode-design-system` OpenCode v2 plugin.
- Use the current v2 APIs from `@opencode/plugin`; do not port v1 plugin hooks.
- Keep the framework-neutral Design System format authoritative. The HTML preview is generated output.
- Preserve user-owned project files. Generated support files use the documented managed markers and are never silently replaced.
- Run `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` after implementation changes.
- Keep project scanning read-only, bounded, and limited to likely UI/style sources.
