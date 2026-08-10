import { Menu } from 'obsidian'
import { getStatusConfig, dueUrgency, isTerminalStatus, safeAsync } from '../../utils'
import type { Task } from '../../types'
import type { TableContext } from './TableRenderer'
import { openTaskModal } from '../../ui/ModalFactory'
import { buildTaskContextMenu } from '../../ui/TaskContextMenu'
import { TaskRow } from '../../ui/composites/TaskRow'
import { ActionsCell } from '../../ui/composites/cells/ActionsCell'
import { AssigneesCell } from '../../ui/composites/cells/AssigneesCell'
import { DueDateCell } from '../../ui/composites/cells/DueDateCell'
import { PriorityCell } from '../../ui/composites/cells/PriorityCell'
import { ProgressCell } from '../../ui/composites/cells/ProgressCell'
import { StatusCell } from '../../ui/composites/cells/StatusCell'
import { TagsCell } from '../../ui/composites/cells/TagsCell'
import { TitleCell } from '../../ui/composites/cells/TitleCell'

export function renderTaskRow(tbody: HTMLElement, task: Task, depth: number, ctx: TableContext): void {
  const isDone = isTerminalStatus(task.status, ctx.statuses)
  const statusConfig = getStatusConfig(ctx.statuses, task.status)

  const { el: row } = new TaskRow(tbody, {
    taskId: task.id,
    depth,
    isDone,
    isArchived: !!task.archived,
    isSelected: false,
    onRowClick: () => {
      openTaskModal(ctx.plugin, ctx.project, {
        task,
        onSave: async () => {
          await ctx.onRefresh()
        }
      })
    }
  })

  new TitleCell(row, {
    task,
    depth,
    showTagColors: ctx.plugin.settings.showTagColors,
    onTitleClick: () => {
      openTaskModal(ctx.plugin, ctx.project, {
        task,
        onSave: async () => {
          await ctx.onRefresh()
        }
      })
    },
    onTitleSave: async (title) => {
      await ctx.plugin.store.updateTask(ctx.project, task.id, { title })
      await ctx.onRefresh()
    },
    onAddSubtask: ctx.plugin.settings.tableShowSubtasks
      ? () => {
          openTaskModal(ctx.plugin, ctx.project, {
            parentId: task.id,
            onSave: async () => {
              await ctx.onRefresh()
            }
          })
        }
      : undefined
  })

  new StatusCell(row, {
    task,
    statuses: ctx.statuses,
    onChange: safeAsync(async (status) => {
      await ctx.plugin.store.updateTask(ctx.project, task.id, { status })
      await ctx.onRefresh()
    })
  })

  new PriorityCell(row, {
    task,
    priorities: ctx.priorities,
    onChange: safeAsync(async (priority) => {
      await ctx.plugin.store.updateTask(ctx.project, task.id, { priority })
      await ctx.onRefresh()
    })
  })

  new AssigneesCell(row, task.assignees)

  new DueDateCell(row, {
    task,
    urgency: dueUrgency(task, ctx.statuses),
    onSave: async (val) => {
      await ctx.plugin.store.updateTask(ctx.project, task.id, { due: val })
      await ctx.plugin.store.scheduleAfterChange(ctx.project, task.id)
      await ctx.onRefresh()
    }
  })

  new ProgressCell(row, {
    value: task.progress,
    color: statusConfig?.color ?? 'var(--interactive-accent)',
    onSave: async (progress) => {
      await ctx.plugin.store.updateTask(ctx.project, task.id, { progress })
      await ctx.onRefresh()
    }
  })

  new TagsCell(row, task.tags, ctx.plugin.settings.showTagColors)

  new ActionsCell(row, {
    onClick: (e) => {
      const menu = new Menu()
      buildTaskContextMenu(menu, task, { plugin: ctx.plugin, project: ctx.project, onRefresh: ctx.onRefresh })
      menu.showAtMouseEvent(e)
    }
  })
}

export function updateSelectAllCheckbox(state: TableState): void {
  if (!state.tableBody) return
  const wrapper = state.tableBody.closest('.pm-table-wrapper')
  if (!wrapper) return
  const selectAllCb = wrapper.querySelector<HTMLInputElement>('.pm-select-all-checkbox')
  if (!selectAllCb) return
  const ids = getVisibleTaskIds(state)
  if (ids.length === 0) {
    selectAllCb.checked = false
    selectAllCb.indeterminate = false
  } else if (ids.every((id) => state.selectedTaskIds.has(id))) {
    selectAllCb.checked = true
    selectAllCb.indeterminate = false
  } else if (ids.some((id) => state.selectedTaskIds.has(id))) {
    selectAllCb.checked = false
    selectAllCb.indeterminate = true
  } else {
    selectAllCb.checked = false
    selectAllCb.indeterminate = false
  }
}

export function updateSelectedRow(state: TableState): void {
  if (!state.tableBody) return
  state.tableBody.querySelectorAll('.pm-table-row--selected').forEach((r) => r.removeClass('pm-table-row--selected'))
  if (!state.selectedTaskId) return

  let row = state.tableBody.querySelector(`tr[data-task-id="${state.selectedTaskId}"]`)
  if (!row && state.wrapper && state.renderWindow) {
    // Row is outside the virtual window: scroll it into range and re-render.
    const idx = state.visibleRows.findIndex((f) => f.task.id === state.selectedTaskId)
    if (idx === -1) return
    const thead = state.wrapper.querySelector('thead')
    const headerHeight = thead instanceof HTMLElement ? thead.offsetHeight : 0
    state.wrapper.scrollTop = Math.max(0, idx * state.rowHeight + headerHeight - state.wrapper.clientHeight / 2)
    state.renderWindow()
    row = state.tableBody.querySelector(`tr[data-task-id="${state.selectedTaskId}"]`)
  }
  if (row) {
    row.addClass('pm-table-row--selected')
    ;(row as HTMLElement).scrollIntoView({ block: 'nearest' })
  }
}
