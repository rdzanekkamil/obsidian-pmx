# Changelog

## [0.1.3] - 2026-08-11

### Added

- **Project details file** — toolbar button opens the project's details file. If none exists, creates `<slug>-details.md` in the project folder. Path stored in project frontmatter.
- **Version system** — create versions, assign tasks, set planned release date, mark as released. Dedicated Versions view shows all versions with collapsible task lists.
- **REST API v2** — rebuilt from scratch at `/api/v2`. Projects lazy-loaded. Self-contained documentation.
- **MCP server v2** — direct store access, session-based initialization, proper tools/list response.
- **Project details file support** — link and create extended project notes from the project toolbar.

### Changed

- **Table redesign** — full UI overhaul: div-based rows with left status bar, card-style layout, sticky header, brighter dark palette, new color system.
- **Versions view redesign** — dark release-timeline UI with collapsible task sections per version.
- **MCP and API sections in settings** — copy endpoint button.

### Fixed

- **Table sticky header** — header moved inside scrollable wrapper so `position: sticky` works correctly.
- **Status badge icons** — now shows icon when configured, dot hidden.
- **Priority badge icons** — shows chevron icon from `PRIORITY_CHEVRONS`, respects custom icon.
- **Tag chip styles** — applied via `.style.*` instead of invalid `css:` option.
- **Tooltip accessibility** — replaced `setAttribute('title', ...)` with Obsidian's `setTooltip()`.
- **color-mix CSS variables** — replaced bare CSS var fallbacks with hex values (`#868e96`).
- **Dead code removal** — unused `safeAsync` import and `addRow` variable removed.

---

## [0.1.2] - 2026-08-11

### Changed

- **Table redesign** — full UI overhaul with card-style layout and brighter dark palette.

---

## [0.1.1] - 2026-08-10

Initial fork release.
