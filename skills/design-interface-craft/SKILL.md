---
name: Product interface craft
description: Design distinctive, coherent product screens and components by making hierarchy, density, composition, and states intentional.
---

> Adapted and modified for OpenCode Design System in 2026 from [Dammyjay93's Interface Design](https://github.com/Dammyjay93/interface-design). Copyright © 2026 Damola Akinleye. Licensed under MIT; see [LICENSE](LICENSE).

# Purpose and boundaries

Use for product interfaces such as dashboards, settings, admin tools, data screens, and interactive components. Coordinate with `opencode-design-visual-direction` for the visual concept and `opencode-design-token-accessibility` for accessible token pairs and states. Marketing and brand pages may need a different composition; do not force product-dashboard patterns onto them.

## Start with the person and task

Identify who is using the screen, what they need to accomplish, what information or action matters most, and what the product should feel like. Read the existing Design System before proposing new values. Keep its documented tokens and decisions authoritative unless the user agrees to change them.

## Make hierarchy visible

- Name the focal task or content and make it lead through position, scale, weight, contrast, or whitespace.
- Choose density deliberately for the task. Group related controls closely and separate distinct areas; do not make every region equally dense or equally spacious.
- Treat navigation, data, empty states, and status as part of the interface—not generic chrome around a component demo.
- Choose layout proportions and alignment to communicate relationships. Use cards, borders, dividers, badges, and accent colors only when they help structure or comprehension.
- Vary expressions of repeated concepts when their meaning differs. A metric, status, or action does not need the same card treatment everywhere.

## Reuse the system; specify complete behavior

Use existing semantic tokens and documented components/patterns before proposing new ones. Keep design decisions framework-neutral. Describe relevant default, hover, active, focus, disabled, loading, empty, error, and success states; include keyboard behavior, responsive reflow, and motion preferences where applicable. Preserve semantic meaning and user input through validation and error recovery.

Do not introduce a parallel `.interface-design/system.md` or another token vocabulary. Record agreed project decisions in the existing Design System's foundations, preferences, decisions, component/pattern documents, or screen briefs.

## Critique before handing off

- **Swap test:** if the layout and typography were replaced with common defaults, would the product's identity disappear? Strengthen choices that are currently interchangeable.
- **Squint test:** is the focal point and hierarchy still apparent without harsh decoration?
- **Signature test:** can you point to specific choices that connect the screen to this product and task?
- **State and accessibility check:** could a person understand status, operate controls by keyboard, and use the screen at narrow widths and with reduced motion? Coordinate token contrast checks with the accessibility skill.

Do not implement application code when the request is for a screen specification. If the request is a redesign of an existing system, describe consequential changes and ask before replacing established decisions.
