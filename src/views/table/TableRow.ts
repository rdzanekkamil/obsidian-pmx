import { Menu, setIcon } from 'obsidian'
import { getStatusConfig, getPriorityConfig, dueUrgency, isTerminalStatus, safeAsync, formatDateLong } from '../../utils'
import type { Task } from '../../types'
import type { TableContext } from './TableRenderer'
import { openTaskModal } from '../../ui/ModalFactory'
import { buildTaskContextMenu } from '../../ui/TaskContextMenu'
import { makeInlineEdit } from '../../ui/composites/cells/inlineEdit'

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#3b82f6'
]

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

export function renderTaskRow(list: HTMLElement, task: Task, depth: number, ctx: TableContext): void {
  const isDone = isTerminalStatus(task.status, ctx.statuses)
  const statusConfig = getStatusConfig(ctx.statuses, task.status)
  const priorityConfig = getPriorityConfig(ctx.priorities, task.priority)
  const urg = dueUrgency(task, ctx.statuses)

  const row = list.createDiv('pm-task-row')
  if (isDone) row.addClass('pm-task-row--done')
  if (task.archived) row.addClass('pm-task-row--archived')
  row.setAttribute('data-task-id', task.id)

  // Status bar
  const bar = row.createDiv('pm-task-row__status-bar')
  bar.style.background = statusConfig?.color ?? 'var(--pm-border)'

  // Title cell
  const titleCell = row.createDiv('pm-task-row__title')

  // Title main row
  const titleMain = titleCell.createDiv('pm-task-row__title-main')

  // Indent
  if (depth > 0) {
    titleMain.style.paddingLeft = `${depth * 18 + 10}px`
  }

  const titleText = titleMain.createSpan('pm-task-title-text')
  titleText.setText(task.title)
  titleText.addEventListener('click', () => {
    openTaskModal(ctx.plugin, ctx.project, { task, onSave: async () => { await ctx.onRefresh() } })
  })
  titleText.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    makeInlineEdit({
      container: titleCell,
      display: titleText,
      inputType: 'text',
      value: task.title,
      onSave: async (val) => {
        await ctx.plugin.store.updateTask(ctx.project, task.id, { title: val })
        await ctx.onRefresh()
      }
    })
  })

  // Type chips
  if (task.type === 'milestone' || task.type === 'subtask' || task.recurrence || task.archived) {
    const chips = titleMain.createDiv('pm-task-type-chips')
    if (task.type === 'milestone') chip(chips, 'M', 'var(--color-purple)', 'Milestone')
    if (task.type === 'subtask')   chip(chips, 'Sub', 'var(--color-green)', 'Subtask')
    if (task.recurrence)           chip(chips, 'R', 'var(--color-blue)', 'Recurring')
    if (task.archived)             chip(chips, 'Archived', 'var(--pm-text-muted)', 'Archived')
  }

  // Tags
  if (task.tags.length) {
    const tagRow = titleCell.createDiv('pm-table-tags')
    for (const tag of task.tags) {
      const dot = tagRow.createSpan('pm-chip-dot')
      dot.style.background = tagColor(tag)
      tagRow.createSpan({ text: tag, cls: 'pm-chip pm-chip--tag', css: { paddingLeft: '4px', fontSize: '11px', color: 'var(--pm-text-muted)' } })
    }
  }

  // Status
  const statusCell = row.createDiv('pm-task-row__status')
  const statusBadge = statusCell.createDiv('pm-status-badge')
  statusBadge.style.borderColor = `color-mix(in srgb, ${statusConfig?.color ?? '#888'} 40%, transparent)`
  statusBadge.style.color = statusConfig?.color ?? 'var(--pm-text-muted)'
  statusBadge.style.background = `color-mix(in srgb, ${statusConfig?.color ?? '#888'} 10%, transparent)`
  const statusDot = statusBadge.createSpan('pm-status-dot')
  statusDot.style.background = statusConfig?.color ?? 'var(--pm-text-muted)'
  statusBadge.createSpan({ text: statusConfig?.label ?? task.status })
  statusBadge.addEventListener('click', (e) => {
    e.stopPropagation()
    const menu = new Menu()
    for (const s of ctx.statuses) {
      menu.addItem((item) => {
        item.setTitle(s.label).setChecked(s.id === task.status).onClick(async () => {
          await ctx.plugin.store.updateTask(ctx.project, task.id, { status: s.id })
          await ctx.onRefresh()
        })
        if (s.icon) item.setIcon(s.icon)
      })
    }
    menu.showAtMouseEvent(e)
  })

  // Priority
  const priorityCell = row.createDiv('pm-task-row__priority')
  const prioChip = priorityCell.createDiv('pm-priority-chip')
  prioChip.style.background = `color-mix(in srgb, ${priorityConfig?.color ?? '#888'} 10%, transparent)`
  prioChip.style.color = priorityConfig?.color ?? 'var(--pm-text-muted)'
  prioChip.style.border = `1px solid color-mix(in srgb, ${priorityConfig?.color ?? '#888'} 30%, transparent)`
  prioChip.createSpan({ text: task.priority })
  prioChip.addEventListener('click', (e) => {
    e.stopPropagation()
    const menu = new Menu()
    for (const p of ctx.priorities) {
      menu.addItem((item) => {
        item.setTitle(p.label).setChecked(p.id === task.priority).onClick(async () => {
          await ctx.plugin.store.updateTask(ctx.project, task.id, { priority: p.id })
          await ctx.onRefresh()
        })
      })
    }
    menu.showAtMouseEvent(e)
  })

  // Assignees
  const assigneesCell = row.createDiv('pm-task-row__assignees')
  if (task.assignees.length) {
    for (let i = 0; i < Math.min(task.assignees.length, 3); i++) {
      const av = assigneesCell.createDiv('pm-avatar')
      av.style.background = avatarColor(task.assignees[i])
      av.style.color = '#fff'
      av.createSpan({ text: initials(task.assignees[i]) })
      if (i > 0) (av as HTMLElement).style.marginLeft = '-6px'
    }
    if (task.assignees.length > 3) {
      const more = assigneesCell.createDiv('pm-avatar pm-avatar--more')
      more.createSpan({ text: `+${task.assignees.length - 3}` })
    }
  }

  // Due date
  const dueCell = row.createDiv('pm-task-row__due')
  if (task.due) {
    const dueSpan = dueCell.createSpan('pm-due-text')
    dueSpan.setText(formatDateLong(task.due))
    if (urg === 'overdue') dueSpan.addClass('pm-due-text--overdue')
    else if (urg === 'near') dueSpan.addClass('pm-due-text--near')
    dueSpan.addEventListener('click', (e) => {
      e.stopPropagation()
      const display = dueSpan
      makeInlineEdit({
        container: dueCell,
        display,
        inputType: 'date',
        value: task.due,
        onSave: async (val) => {
          await ctx.plugin.store.updateTask(ctx.project, task.id, { due: val })
          await ctx.plugin.store.scheduleAfterChange(ctx.project, task.id)
          await ctx.onRefresh()
        }
      })
    })
  } else {
    const empty = dueCell.createSpan('pm-due-text')
    empty.setText('—')
    empty.style.color = 'var(--pm-text-faint)'
    empty.addEventListener('click', (e) => {
      e.stopPropagation()
      makeInlineEdit({ container: dueCell, display: empty, inputType: 'date', value: '', onSave: async (val) => {
        await ctx.plugin.store.updateTask(ctx.project, task.id, { due: val })
        await ctx.onRefresh()
      }})
    })
  }

  // Progress
  const progressCell = row.createDiv('pm-task-row__progress')
  const progBar = progressCell.createDiv('pm-progress')
  const progTrack = progBar.createDiv('pm-progress-track')
  const progFill = progTrack.createDiv('pm-progress-fill')
  progFill.style.width = `${task.progress}%`
  progFill.style.background = statusConfig?.color ?? 'var(--pm-accent)'
  const progLabel = progBar.createSpan('pm-progress-label')
  progLabel.setText(`${task.progress}%`)
  progressCell.addEventListener('click', (e) => {
    e.stopPropagation()
    makeInlineEdit({
      container: progressCell,
      display: progBar,
      inputType: 'number',
      value: String(task.progress),
      onSave: async (val) => {
        const n = Math.max(0, Math.min(100, Math.round(parseFloat(val) || 0)))
        await ctx.plugin.store.updateTask(ctx.project, task.id, { progress: n })
        await ctx.onRefresh()
      }
    })
  })

  // Actions
  const actionsCell = row.createDiv('pm-task-row__actions')
  const menuBtn = actionsCell.createEl('button', 'pm-icon-btn pm-icon-btn--hover-only')
  menuBtn.setAttribute('aria-label', 'Task actions')
  setIcon(menuBtn, 'more-horizontal')
  menuBtn.addEventListener('click', (e) => {
    const menu = new Menu()
    buildTaskContextMenu(menu, task, { plugin: ctx.plugin, project: ctx.project, onRefresh: ctx.onRefresh })
    menu.showAtMouseEvent(e)
  })
}

function chip(parent: HTMLElement, label: string, color: string, tooltip: string): void {
  const el = parent.createDiv('pm-chip pm-chip--sm')
  el.style.background = `color-mix(in srgb, ${color} 10%, transparent)`
  el.style.color = color
  el.style.border = `1px solid color-mix(in srgb, ${color} 30%, transparent)`
  el.setText(label)
  el.setAttribute('title', tooltip)
}

function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffffffff
  const hue = Math.abs(h) % 360
  return `hsl(${hue}, 55%, 55%)`
}
