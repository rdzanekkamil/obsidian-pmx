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

  new ActionsCell(row, {
    onClick: (e) => {
      const menu = new Menu()
      buildTaskContextMenu(menu, task, { plugin: ctx.plugin, project: ctx.project, onRefresh: ctx.onRefresh })
      menu.showAtMouseEvent(e)
    }
  })
}
