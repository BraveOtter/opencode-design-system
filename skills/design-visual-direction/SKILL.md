---
name: Design visual direction
description: Establish a brief-specific visual identity and avoid generic interface defaults when creating or changing a Design System or screen.
---

> Adapted and modified for OpenCode Design System in 2026 from [Anthropic's Frontend Design skill](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design/skills/frontend-design). Original authors: Prithvi Rajasekaran and Alexander Bricken. Licensed under Apache-2.0; see [LICENSE](LICENSE).

# Purpose and boundaries

Use this skill to establish or materially change a visual direction, including its color and typography tokens. It works with `opencode-design-interface-craft` and `opencode-design-token-accessibility`; it does not replace the user's brief, an existing Design System, or the framework-neutral Markdown and JSON sources.

## Work from the brief, not from a house style

Before choosing visual values, identify the product, its audience, the primary task, the expected context of use, and any explicit preferences. For an existing system, read its foundations, preferences, decisions, and relevant tokens first. Ask one concise question when a consequential identity decision cannot be inferred safely; otherwise state the assumption and proceed.

Derive visual cues from the product's real subject matter. Propose a coherent direction for palette, type, composition, density, and one memorable signature. Name likely defaults for this product category and choose alternatives only where the brief supports them. Do not manufacture novelty through decoration.

## Avoid unearned defaults

Treat these as prompts to reconsider, not forbidden styles: purple/blue gradients used without a product reason; identical rounded cards for every content type; the same radius and shadow everywhere; ornamental all-caps eyebrow labels; a single highlighted word in every headline; automatic numbered lists; decorative glows, halos, or pulsing dots on ordinary status indicators; and motion on every section or hover target.

A treatment is appropriate when it serves the brief, communicates a real state, or is an explicit user preference. Do not replace a user's requested style with this skill's own preferred aesthetic. Do not force unusual fonts, asymmetry, dark themes, textures, or animation merely to appear distinctive.

## Make visual choices specific and usable

- Make content and product context do the design work; use real or plausible task-specific language rather than generic filler.
- Select colors as semantic roles, not as an unstructured set of attractive swatches. Coordinate with the accessibility skill before committing foreground/background combinations.
- Give typography clear roles and a readable scale. Distinction does not require multiple typefaces.
- Use borders, labels, numbers, motion, and color when they communicate hierarchy or meaning; remove them when they only add noise.
- Prefer one deliberate signature surrounded by disciplined supporting choices. Keep responsive behavior, keyboard focus, and reduced-motion preferences in scope.

## Review the direction

Before creating or changing tokens, ask whether another product with a similar prompt would receive substantially the same direction. If so, revisit the domain cues and signature. Check that every notable choice has a reason in the brief, existing system, or interaction model. When the visual direction conflicts with an existing explicit decision, describe the conflict and ask before changing the system.
