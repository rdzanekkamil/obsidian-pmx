import type PMPlugin from '../../main'
import type { Project, FilterState, PriorityConfig, StatusConfig } from '../../types'
import { type FlatTask, flattenTasks } from '../../store/TaskTreeOps'
import { applyTaskFilterFlat, isFilterActive } from '../../store/TaskFilter'
import { openTaskModal } from '../../ui/ModalFactory'
import { renderAddButton } from '../../ui/composites/addButton'
import { compareTask } from './TableFilters'
import { renderTaskRow } from './TableRow'

type SortKey = 'title' | 'status' | 'priority' | 'due' | 'assignees' | 'progress'
type SortDir = 'asc' | 'desc'

export type { SortKey, SortDir }

export interface TableState {
  sortKey: SortKey
  sortDir: SortDir
  filter: FilterState
  listEl: HTMLElement | null
  wrapper: HTMLElement | null
  headerEl: HTMLElement | null
  visibleRows: FlatTask[]
  rowHeight: number
  heightCalibrated: boolean
  windowStart: number
  windowEnd: number
  renderWindow: (() => void) | null
}

export interface TableContext {
  container: HTMLElement
  project: Project
  plugin: PMPlugin
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  state: TableState
  onRefresh: () => Promise<void>
}

export function renderTable(ctx: TableContext): void {
  const wrapper = ctx.container.createDiv('pm-table-wrapper')
  ctx.state.wrapper = wrapper
  let scrollScheduled = false
  wrapper.addEventListener('scroll', () => {
    if (scrollScheduled) return
    scrollScheduled = true
    window.requestAnimationFrame(() => {
      scrollScheduled = false
      const { start, end } = computeWindow(ctx.state)
      if (start === ctx.state.windowStart && end === ctx.state.windowEnd) return
      ctx.state.renderWindow?.()
    })
  })

  // Header row
  const header = wrapper.createDiv('pm-table-header')
  ctx.state.headerEl = header

  const cols: { key: SortKey; label: string; cls: string }[] = [
    { key: 'title',     label: 'Task',      cls: 'pm-th--title' },
    { key: 'status',    label: 'Status',    cls: 'pm-th--status' },
    { key: 'priority',  label: 'Priority',  cls: 'pm-th--priority' },
    { key: 'assignees', label: 'Assignees', cls: 'pm-th--assignees' },
    { key: 'due',       label: 'Due',       cls: 'pm-th--due' },
    { key: 'progress',  label: 'Progress',  cls: 'pm-th--progress' },
  ]

  const sortEls: { key: SortKey; el: HTMLElement }[] = []
  const paintSortIndicators = () => {
    for (const { key, el } of sortEls) {
      const existing = el.querySelector('.pm-sort-indicator')
      existing?.remove()
      if (ctx.state.sortKey === key) {
        el.createSpan({ text: ctx.state.sortDir === 'asc' ? ' ↑' : ' ↓', cls: 'pm-sort-indicator' })
      }
    }
  }

  for (const col of cols) {
    const th = header.createDiv('pm-th pm-th--sortable ' + col.cls)
    th.setAttribute('role', 'button')
    th.setAttribute('aria-label', `Sort by ${col.label}`)
    th.createSpan({ text: col.label })
    sortEls.push({ key: col.key, el: th })
    th.addEventListener('click', () => {
      if (ctx.state.sortKey === col.key) {
        ctx.state.sortDir = ctx.state.sortDir === 'asc' ? 'desc' : 'asc'
      } else {
        ctx.state.sortKey = col.key as SortKey
        ctx.state.sortDir = 'asc'
      }
      paintSortIndicators()
      refreshTableBody(ctx)
    })
  }
  header.createDiv('pm-th pm-th--actions')
  paintSortIndicators()

  // Scrollable list
  const list = wrapper.createDiv()
  ctx.state.listEl = list
  fillTableBody(ctx)
}

export function refreshTableBody(ctx: TableContext): void {
  if (ctx.state.listEl) fillTableBody(ctx)
}

function fillTableBody(ctx: TableContext): void {
  const list = ctx.state.listEl
  if (!list) return

  let flat = flattenTasks(ctx.project.tasks)
  const hasActiveFilter = isFilterActive(ctx.state.filter)
  flat = applyTaskFilterFlat(flat, ctx.state.filter, ctx.statuses)

  const filteredIds = new Set(flat.map((f) => f.task.id))

  const childrenByParent = new Map<string | null, FlatTask[]>()
  for (const f of flat) {
    let bucket: string | null
    if (f.parentId === null) {
      bucket = null
    } else if (hasActiveFilter && !filteredIds.has(f.parentId)) {
      bucket = null
    } else {
      bucket = f.parentId
    }
    let arr = childrenByParent.get(bucket)
    if (!arr) { arr = []; childrenByParent.set(bucket, arr) }
    arr.push(f)
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => compareTask(a.task, b.task, ctx.state, ctx.statuses, ctx.priorities))
  }

  const sorted: FlatTask[] = []
  const addWithChildren = (parentId: string | null) => {
    const arr = childrenByParent.get(parentId)
    if (!arr) return
    for (const item of arr) {
      sorted.push(item)
      addWithChildren(item.task.id)
    }
  }
  addWithChildren(null)

  ctx.state.visibleRows = sorted.filter((f) => f.visible && f.depth === 0)
  ctx.state.renderWindow = () => renderWindowRows(ctx)
  ctx.state.windowStart = -1
  ctx.state.windowEnd = -1
  renderWindowRows(ctx)
}

const ROW_OVERSCAN = 8
export const ROW_HEIGHT_ESTIMATE = 48

function computeWindow(state: TableState): { start: number; end: number } {
  const wrapper = state.wrapper
  if (!wrapper) return { start: 0, end: state.visibleRows.length }
  const header = state.headerEl
  const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0
  const scrollTop = Math.max(0, wrapper.scrollTop - headerHeight)
  const viewHeight = wrapper.clientHeight || 600

  let start = Math.floor(scrollTop / state.rowHeight) - ROW_OVERSCAN
  if (start < 0) start = 0
  let end = Math.ceil((scrollTop + viewHeight) / state.rowHeight) + ROW_OVERSCAN
  if (end > state.visibleRows.length) end = state.visibleRows.length
  return { start, end }
}

function renderWindowRows(ctx: TableContext): void {
  const { state } = ctx
  const list = state.listEl
  if (!list) return

  const rows = state.visibleRows
  const { start, end } = computeWindow(state)
  state.windowStart = start
  state.windowEnd = end

  list.empty()
  if (start > 0) {
    const spacer = list.createDiv('pm-table-spacer')
    spacer.style.height = `${start * state.rowHeight}px`
  }
  for (let i = start; i < end; i++) {
    renderTaskRow(list, rows[i].task, rows[i].depth, ctx)
  }
  if (end < rows.length) {
    const spacer = list.createDiv('pm-table-spacer')
    spacer.style.height = `${(rows.length - end) * state.rowHeight}px`
  }

  const addRow = list.createDiv('pm-table-add-row')
  renderAddButton(addRow, 'Add task', () => {
    openTaskModal(ctx.plugin, ctx.project, { onSave: () => ctx.onRefresh() })
  })

  if (!state.heightCalibrated) {
    const first = list.querySelector('[data-task-id]')
    if (first instanceof HTMLElement && first.offsetHeight > 0) {
      state.heightCalibrated = true
      if (Math.abs(first.offsetHeight - state.rowHeight) > 1) {
        state.rowHeight = first.offsetHeight
        renderWindowRows(ctx)
      }
    }
  }
}
