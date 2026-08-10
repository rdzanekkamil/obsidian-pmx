import type PMPlugin from '../../main'
import type { Project, FilterState } from '../../types'
import type { SubView } from '../SubView'
import { renderTable, refreshTableBody, ROW_HEIGHT_ESTIMATE } from './TableRenderer'
import type { SortKey, SortDir, TableState } from './TableRenderer'

export interface TableViewState {
  sortKey: SortKey
  sortDir: SortDir
}

export class TableView implements SubView {
  private state: TableState
  private pendingScrollTop: number | null = null

  constructor(
    private container: HTMLElement,
    private project: Project,
    private plugin: PMPlugin,
    private onRefresh: () => Promise<void>,
    filter: FilterState,
    initialState?: TableViewState
  ) {
    this.state = {
      sortKey: initialState?.sortKey ?? 'status',
      sortDir: initialState?.sortDir ?? 'asc',
      filter,
      tableBody: null,
      wrapper: null,
      visibleRows: [],
      rowHeight: ROW_HEIGHT_ESTIMATE,
      heightCalibrated: false,
      windowStart: -1,
      windowEnd: -1,
      renderWindow: null
    }
  }

  getScrollTop(): number {
    const wrapper = this.container.querySelector('.pm-table-wrapper')
    return wrapper?.scrollTop ?? 0
  }

  setPendingScrollTop(top: number): void {
    this.pendingScrollTop = top
  }

  getViewState(): TableViewState {
    return {
      sortKey: this.state.sortKey,
      sortDir: this.state.sortDir
    }
  }

  render(): void {
    this.state.tableBody = null
    this.container.empty()
    this.container.addClass('pm-table-view')

    const ctx = this.makeTableContext()
    renderTable(ctx)

    if (this.pendingScrollTop !== null) {
      const wrapper = this.container.querySelector('.pm-table-wrapper')
      if (wrapper) {
        wrapper.scrollTop = this.pendingScrollTop
        this.state.renderWindow?.()
      }
      this.pendingScrollTop = null
    }
  }

  refresh(): void {
    if (this.state.tableBody) {
      refreshTableBody(this.makeTableContext())
    } else {
      this.render()
    }
  }

  private makeTableContext() {
    const config = this.plugin.store.configFor(this.project)
    return {
      container: this.container,
      project: this.project,
      plugin: this.plugin,
      statuses: config.statuses,
      priorities: config.priorities,
      state: this.state,
      onRefresh: this.onRefresh
    }
  }
}
