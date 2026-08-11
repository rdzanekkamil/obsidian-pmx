# Project ManagerX

*A full-featured project management plugin for Obsidian. Tasks, versions, scheduling, time tracking, custom fields — all stored as plain Markdown.*

**[Install via BRAT](#installation)** · **[Changelog](CHANGELOG.md)**

---

## What it does

Manage projects and tasks directly in your vault. Projects are folders; tasks are Markdown files with YAML frontmatter. No database, no cloud, no accounts. Your data lives where your notes live.

## Views

**Table** — Sortable, filterable task grid with inline editing, bulk actions, and saved filter combinations.

**Gantt** — Interactive timeline with drag-to-reschedule, resize handles, dependency arrows, milestone diamonds, and a today marker.

**Kanban** — Drag cards between status columns to update task state instantly.

**Versions** — Track releases and milestones. Assign tasks to a version, set a planned release date, and mark it as released.

## Features

### Task management
- Subtasks nested to any depth
- Dependencies with blocking/dependent links
- Milestones (zero-duration markers on the Gantt)
- Archive completed tasks without deleting them
- Recurring tasks (daily, weekly, monthly, yearly)
- Bulk actions: set status, priority, assignee, tag, due date, progress, archive, delete

### Scheduling
- Drag Gantt bars to reschedule
- Auto-scheduling: when a blocker moves, dependents follow (cycles blocked)
- Pull-forward on early finish: completing a task ahead of schedule moves its dependents earlier
- Due date notifications with configurable lead time

### Time tracking
- Time estimates per task
- Time logs with date, hours, and notes
- Visual progress bar (logged vs. estimated)

### Extended task fields
- **Acceptance criteria** — conditions that mark the task complete
- **Goal** — the objective
- **Blocker** — what's blocking progress
- **Result** — expected outcome
- **URL** — related link
- **Version** — which release this task belongs to

### Customization
- Custom fields per project: text, number, date, checkbox, select, multi-select, person, URL
- Custom statuses: label, color, icon (emoji or Lucide icon from Obsidian's icon set)
- Custom priorities: label, color, icon
- Per-project configuration: statuses, priorities, default view, scheduling options, board display
- Saved views: store filter/sort combinations and switch between them instantly
- Team roster: global list + per-project members

### Import
- Convert existing vault notes into tasks: select files, pick defaults, move or copy
- Integrates with TaskNotes (4.10+): imports dates, dependencies, subtasks, tags, recurrence, archive state; aligns status and priority palettes

### API & MCP
- REST API server (toggle in settings) for programmatic access
- MCP server for use with AI tools

## Collaboration

The vault is the database. Anything that syncs your vault syncs your projects.

- **Git** — commit, push, pull. Conflicts are regular Markdown conflicts, resolved the same way.
- **Obsidian Sync, iCloud, Dropbox, Syncthing** — work without extra setup.

Each team member sees their own due date reminders locally. There is no real-time multi-user editing — simultaneous edits produce a sync conflict, same as any shared note.

## Settings

| Setting | Description |
|---|---|
| Projects folder | Vault folder for projects and tasks (default: `Projects/`) |
| Default view | Table, Gantt, or Kanban |
| Gantt granularity | Default timeline scale |
| Gantt week labels | Week number, date range, or both |
| Show subtasks in Table | Toggle subtask rows in Table view |
| Show subtasks in Kanban | Show subtasks as individual cards |
| Show description preview | Show first lines of each task in Kanban |
| Due date notifications | Remind N days before due dates |
| Auto-schedule | Move dependents when a blocker moves |
| Pull forward on early finish | Move dependents earlier when a blocker completes ahead |
| Hide done in Gantt | Skip completed/cancelled tasks on the timeline |
| Show tag colors | Colored dot per tag |
| Custom statuses | Edit labels, colors, icons |
| Custom priorities | Edit labels, colors, icons |
| Team members | Global roster for task assignment |
| Save tasks on close | Off = discard edits on close |
| REST API / MCP | Toggle built-in API servers |

## Task properties

| Property | Description |
|---|---|
| Title | Task name |
| Description | Rich Markdown body |
| Type | Task, Subtask, or Milestone |
| Status | Configurable (default: To Do, In Progress, Blocked, In Review, Done, Cancelled) |
| Priority | Configurable (default: Critical, High, Medium, Low) |
| Start / Due | Date boundaries |
| Progress | 0–100% completion |
| Time estimate | Estimated hours |
| Time logs | Hours logged with date and notes |
| Assignees | Team members |
| Tags | Freeform labels |
| Subtasks | Nested child tasks |
| Dependencies | Blocking/dependent task IDs |
| Recurrence | Daily, weekly, monthly, yearly with end date |
| Acceptance criteria | Completion conditions |
| Goal / Blocker / Result | Context fields |
| URL | Related link |
| Version | Release this task belongs to |
| Custom fields | Per-project defined fields |

## Data format

Tasks are `.md` files in your vault. Plain text — readable, portable, version-controllable.

```yaml
---
pm-task: true
title: "Ship v1.0"
status: in-progress
priority: high
start: "2026-03-01"
due: "2026-04-01"
progress: 60
assignees: ["alice", "bob"]
tags: ["launch", "frontend"]
dependencies: ["task-abc123"]
versionId: "v-xyz"
---
Task description in Markdown.
```

## Requirements

- Obsidian **1.13.0** or later
- Desktop and mobile supported

## Installation

### Via BRAT (recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the community store.
2. Open BRAT settings → **Add Beta Plugin**.
3. Enter: `https://github.com/rdzanekkamil/obsidian-pmx`
4. Enable the plugin under **Settings → Community plugins**.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](../../releases/latest).
2. Create a folder: `<vault>/.obsidian/plugins/project-manager/`
3. Copy the three files into that folder.
4. Reload Obsidian and enable the plugin under **Settings → Community plugins**.

## Quick start

1. Click the ribbon icon (or run **Open projects pane** from the command palette).
2. Click **New project** — give it a name, color, and icon.
3. Open the project — Table view by default.
4. Press **+ Add task** to create tasks.
5. Switch between Table, Gantt, Kanban, and Versions using the tabs.

## Commands

| Command | Description |
|---|---|
| Open projects pane | Open the project list |
| Create new project | Open the new project modal |
| Create new task | Pick a project, then create a task |
| Create new subtask | Pick a project and a parent task |
| Import notes as tasks | Convert Markdown notes into tasks |
| Open current file as project | Open the active note as a project (`pm-project: true` in frontmatter) |
| Undo / Redo | Revert or reapply the last change |

## Fork notes

This is a community fork of the [Project Manager](https://github.com/StepanKropachev/obsidian-pm) plugin by [Stepan Kropachev](https://github.com/StepanKropachev). Changes and customizations by [Kamil Rdzanek](https://github.com/rdzanekkamil).

## License

MIT
