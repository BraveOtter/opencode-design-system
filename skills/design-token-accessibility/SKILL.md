---
name: Accessible design tokens
description: Check accessibility while selecting or changing semantic tokens, themes, typography, focus, motion, and interactive states.
---

> Adapted and modified for OpenCode Design System in 2026 from Community-Access's [Design System Auditor](https://github.com/Community-Access/accessibility-agents/blob/main/skills/design-system-auditor/SKILL.md). Copyright © 2026 Taylor Arndt. Licensed under MIT; see [LICENSE](LICENSE). WCAG criteria below are checked against the published WCAG 2.2 standard.

# Purpose and boundaries

Apply during visual direction, token selection or updates, and screen/component specification—not only as a final audit. Coordinate with `opencode-design-visual-direction` and `opencode-design-interface-craft`: preserve the intended identity while finding combinations and interaction patterns that meet the accessibility target. Existing project preferences remain important, but do not describe an unverified or failing combination as accessible.

This skill guides design decisions; it does not prove conformance of rendered application code. Assess actual UI states separately when implementation exists.

## Validate intended token pairs

Do not test every color against every other color. Identify the semantic foreground/background combinations the system intends to use, for every supported theme—for example body text on base/raised surfaces, links on body text/surfaces, button text on action fills, status text/icons on status surfaces, and focus indicators against adjacent surfaces.

For WCAG 2.2 Level AA, use these minimums as applicable:

- Normal text: **4.5:1** (SC 1.4.3).
- Large text: **3:1** (SC 1.4.3).
- Visual information needed to identify controls/states and meaningful graphical objects: **3:1** against adjacent colors (SC 1.4.11).

Check the actual rendered pair, including opacity, overlays, gradients, and surfaces. Do not round a failing ratio up. If a proposed brand color fails in one role, keep it where it works and propose a role-specific accessible variant or pairing rather than flattening the whole palette.

## Preserve meaning without color alone

Color must not be the only way to distinguish statuses, errors, selection, or actions (SC 1.4.1). Pair it with visible wording, a shape, icon, pattern, or another cue appropriate to the content. A status dot can be useful, but its color alone must not carry the full message; give the status an accessible name or nearby text. Do not add glow/halo/pulse as decoration. Use motion only when it communicates a meaningful change, and respect `prefers-reduced-motion`.

## Design focus and interaction states

- Preserve a visible keyboard focus indicator (SC 2.4.7). Check that it remains discernible on the adjacent surfaces and in each theme.
- WCAG 2.4.13 Focus Appearance is **Level AAA**, not a universal Level AA requirement. Do not claim WCAG sets a blanket 2px focus-ring minimum; assess the chosen indicator against the applicable conformance target and actual component.
- Include focus, hover, active, selected, disabled, error, success, and other meaningful states in the planned token pairs. Do not communicate a state only by lowering opacity or changing hue.
- When sizing targets, distinguish WCAG 2.5.8's AA minimum and its exceptions from the larger 44×44 CSS-pixel target-size best practice/AAA criterion. Do not silently turn a best practice into a universal AA claim.

## Return actionable design guidance

For each unresolved or failing pair, name the semantic token roles and theme, explain the impact, and offer a nearby alternative that keeps the visual direction. Record which pairings were considered; do not claim full WCAG conformance from token values alone. A final rendered interface may introduce contrast changes through opacity, imagery, state styling, or layout and still needs review.
