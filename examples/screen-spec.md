# Workflow list

## Purpose
Help an operations user find, inspect, and run an automation workflow.

## Layout
- Persistent application sidebar on wide viewports.
- Page header with title, short description, and primary “Create workflow” action.
- Search and status filters above the results table.
- Table with workflow name, owner, last run, status, and a row action menu.

## Components and tokens
- Navigation and Table from the manifest.
- Button: `color.accent.primary`, `radius.control`.
- Search Input and Select filter using their documented states.

## Interactions and states
- Search filters as the user types and exposes a clear action.
- Status filter can be reset independently.
- Empty state offers “Create workflow” and preserves current filters until cleared.
- Loading state uses the system's Skeleton pattern.
- Failed run status is accompanied by a text label and not color alone.

## Responsive behavior
At narrow widths, prioritize name/status, move secondary columns into a details view, and keep row actions reachable.

## Accessibility
Use a named page heading, labeled search/filter controls, keyboard-operable row actions, table headers, and visible focus.
