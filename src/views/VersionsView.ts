import { App, ButtonComponent, setIcon, Modal } from 'obsidian'
import type PMPlugin from '../main'
import type { Project, Task, Version } from '../types'
import { makeId } from '../types'
import type { SubView } from './SubView'
import { openTaskModal } from '../ui/ModalFactory'

interface VersionsViewContext {
  project: Project
  plugin: PMPlugin
  onRefresh: () => Promise<void>
}

interface ExpandedState {
  [versionId: string]: boolean
}

export class VersionsView implements SubView {
  private expanded: ExpandedState = {}
  private showReleased = false

  constructor(
    private container: HTMLElement,
    private ctx: VersionsViewContext
  ) {}

  render(): void {
    const { project, plugin } = this.ctx
    this.container.empty()
    this.container.addClass('pm-versions-view')

    // Header
    const header = this.container.createDiv('pm-versions-header')
    const headerLeft = header.createDiv('pm-versions-header-left')
    headerLeft.createEl('h2', { text: 'Versions' })

    const headerRight = header.createDiv('pm-versions-header-right')
    const toggleReleased = headerRight.createEl('button', { cls: 'pm-versions-toggle-btn' })
    toggleReleased.setText(this.showReleased ? 'Hide released' : 'Show released')
    toggleReleased.addEventListener('click', () => {
      this.showReleased = !this.showReleased
      this.render()
    })

    new ButtonComponent(headerRight)
      .setButtonText('+ New version')
      .setCta()
      .onClick(() => openVersionModal(plugin, project, null, () => { void this.ctx.onRefresh() }))

    // Summary bar
    const allVersions = project.versions
    const released = allVersions.filter((v) => v.releasedAt).length
    const draft = allVersions.filter((v) => !v.releasedAt).length
    const totalTasks = project.tasks.filter((t) => t.versionId).length

    const summary = this.container.createDiv('pm-versions-summary')
    summary.createDiv('pm-versions-stat').innerHTML =
      `<span class="pm-versions-stat-num">${allVersions.length}</span><span class="pm-versions-stat-label">Total</span>`
    summary.createDiv('pm-versions-stat').innerHTML =
      `<span class="pm-versions-stat-num">${draft}</span><span class="pm-versions-stat-label">Active</span>`
    summary.createDiv('pm-versions-stat').innerHTML =
      `<span class="pm-versions-stat-num">${released}</span><span class="pm-versions-stat-label">Released</span>`
    summary.createDiv('pm-versions-stat').innerHTML =
      `<span class="pm-versions-stat-num">${totalTasks}</span><span class="pm-versions-stat-label">Tasks assigned</span>`

    // List
    const list = this.container.createDiv('pm-versions-list')

    const visible = allVersions.filter((v) => this.showReleased || !v.releasedAt)
    if (!visible.length) {
      this.container.createDiv('pm-empty-state').createEl('p', { text: allVersions.length ? 'All versions are released. Toggle "Show released" to view them.' : 'No versions yet. Create your first version above.' })
      return
    }

    for (const version of visible) {
      this.renderVersionCard(list, version)
    }
  }

  refresh(): void {
    this.render()
  }

  private renderVersionCard(container: HTMLElement, version: Version): void {
    const { project, plugin } = this.ctx
    const tasks = project.tasks.filter((t) => t.versionId === version.id)
    const done = tasks.filter((t) => t.completed).length
    const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0
    const isExpanded = !!this.expanded[version.id]
    const isReleased = !!version.releasedAt

    const card = container.createDiv('pm-ver-card')
    card.addClass(isReleased ? 'pm-ver-card--released' : 'pm-ver-card--draft')

    // Card header
    const cardHeader = card.createDiv('pm-ver-card-header')
    cardHeader.addEventListener('click', () => {
      this.expanded[version.id] = !this.expanded[version.id]
      this.render()
    })

    const toggleEl = cardHeader.createDiv('pm-ver-toggle')
    const chevron = toggleEl.createSpan({ cls: 'pm-ver-chevron' })
    setIcon(chevron, isExpanded ? 'chevron-down' : 'chevron-right')

    const info = cardHeader.createDiv('pm-ver-info')
    const titleRow = info.createDiv('pm-ver-title-row')
    titleRow.createEl('strong', { text: version.name, cls: 'pm-ver-name' })

    const badge = titleRow.createEl('span', {
      cls: isReleased ? 'pm-ver-badge pm-ver-badge--released' : 'pm-ver-badge pm-ver-badge--draft'
    })
    badge.setText(isReleased ? 'Released' : 'Draft')

    if (version.plannedReleaseDate) {
      info.createEl('span', {
        text: `Planned: ${version.plannedReleaseDate}`,
        cls: 'pm-ver-date'
      })
    }
    if (isReleased && version.releasedAt) {
      info.createEl('span', {
        text: `Released: ${version.releasedAt.slice(0, 10)}`,
        cls: 'pm-ver-date pm-ver-date--released'
      })
    }

    // Progress + actions
    const metaRow = cardHeader.createDiv('pm-ver-meta-row')
    const progressWrap = metaRow.createDiv('pm-ver-progress-wrap')
    progressWrap.createDiv('span', { text: `${done}/${tasks.length}`, cls: 'pm-ver-count' })
    const track = progressWrap.createDiv('pm-progress-track')
    const fill = track.createDiv('pm-progress-fill')
    fill.style.width = `${progress}%`
    if (isReleased) {
      fill.style.background = 'var(--text-success)'
    }

    const actions = metaRow.createDiv('pm-ver-actions')
    if (!isReleased) {
      new ButtonComponent(actions).setButtonText('Release').setCta()
        .onClick(async () => {
          await plugin.store.releaseVersion(project, version.id)
          await this.ctx.onRefresh()
        })
    }
    new ButtonComponent(actions).setButtonText('Edit')
      .onClick(() => openVersionModal(plugin, project, version, () => { void this.ctx.onRefresh() }))
    new ButtonComponent(actions).setButtonText('Delete').setWarning()
      .onClick(async () => {
        await plugin.store.deleteVersion(project, version.id)
        await this.ctx.onRefresh()
      })

    // Collapsible task list
    if (isExpanded && tasks.length) {
      const tasksEl = card.createDiv('pm-ver-tasks')
      for (const task of tasks) {
        this.renderTaskRow(tasksEl, task)
      }
    } else if (isExpanded && !tasks.length) {
      card.createDiv('pm-ver-tasks-empty').setText('No tasks assigned to this version.')
    }
  }

  private renderTaskRow(container: HTMLElement, task: Task): void {
    const { plugin, project } = this.ctx
    const config = plugin.store.configFor(project)
    const statusCfg = config.statuses.find((s) => s.id === task.status)
    const row = container.createDiv('pm-ver-task-row')
    if (task.completed) row.addClass('pm-ver-task-row--done')

    // Status dot
    const dot = row.createDiv('pm-ver-task-dot')
    dot.style.background = statusCfg?.color ?? 'var(--text-muted)'

    const title = row.createDiv('pm-ver-task-title')
    title.setText(task.title)

    if (task.due) {
      const due = row.createDiv('pm-ver-task-due')
      due.setText(task.due)
      if (statusCfg?.complete) due.addClass('pm-ver-task-due--done')
    }

    const chips = row.createDiv('pm-ver-task-chips')

    if (task.priority) {
      const prioCfg = config.priorities.find((p) => p.id === task.priority)
      if (prioCfg) {
        const chip = chips.createDiv('pm-chip pm-chip--sm pm-chip--solid')
        chip.setCssStyles({ '--pm-chip-color': prioCfg.color })
        chip.setText(prioCfg.label)
      }
    }

    if (task.assignees.length) {
      chips.createDiv('pm-chip pm-chip--sm pm-chip--solid').setText(task.assignees.join(', '))
    }

    // Open task on click
    row.addEventListener('click', () => {
      openTaskModal(plugin, project, { task, onSave: () => { void this.ctx.onRefresh() } })
    })
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function openVersionModal(
  plugin: PMPlugin,
  project: Project,
  version: Version | null,
  onSave: () => void
): void {
  new VersionModal(plugin.app, plugin, project, version, onSave).open()
}

class VersionModal extends Modal {
  private name = ''
  private description = ''
  private plannedReleaseDate = ''

  constructor(
    app: App,
    private plugin: PMPlugin,
    private project: Project,
    private existing: Version | null,
    private onSave: () => void
  ) {
    super(app)
    this.name = existing?.name ?? ''
    this.description = existing?.description ?? ''
    this.plannedReleaseDate = existing?.plannedReleaseDate ?? ''
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.addClass('pm-modal', 'pm-task-modal')
    contentEl.createEl('h2', { text: this.existing ? 'Edit Version' : 'New Version' })

    const form = contentEl.createDiv('pm-task-form')
    const field = (label: string, el: HTMLElement) => {
      const wrap = form.createDiv('pm-task-field')
      wrap.createEl('label', { text: label }).after(el)
    }

    const nameInput = form.createEl('input', { type: 'text', cls: 'pm-input pm-full-width' })
    nameInput.value = this.name
    nameInput.placeholder = 'e.g. v1.0, sprint-5, winter-2026'
    nameInput.addEventListener('input', () => { this.name = nameInput.value })
    field('Name *', nameInput)

    const descArea = form.createEl('textarea', { cls: 'pm-input pm-full-width', attr: { rows: '3' } })
    descArea.value = this.description
    descArea.placeholder = 'What is this release for?'
    descArea.addEventListener('input', () => { this.description = descArea.value })
    field('Description', descArea)

    const dateInput = form.createEl('input', { type: 'date', cls: 'pm-input' })
    dateInput.value = this.plannedReleaseDate
    dateInput.addEventListener('change', () => { this.plannedReleaseDate = dateInput.value })
    field('Planned release date', dateInput)

    const footer = contentEl.createDiv('pm-task-form-footer')
    new ButtonComponent(footer).setButtonText('Cancel').onClick(() => this.close())
    new ButtonComponent(footer)
      .setButtonText(this.existing ? 'Save' : 'Create')
      .setCta()
      .onClick(async () => {
        if (!this.name.trim()) return
        if (!this.existing) {
          await this.plugin.store.createVersion(this.project, {
            id: makeId(),
            name: this.name.trim(),
            description: this.description.trim(),
            plannedReleaseDate: this.plannedReleaseDate,
            releasedAt: '',
            taskIds: [],
            createdAt: new Date().toISOString()
          })
        } else {
          await this.plugin.store.updateVersion(this.project, this.existing.id, {
            name: this.name.trim(),
            description: this.description.trim(),
            plannedReleaseDate: this.plannedReleaseDate
          })
        }
        this.onSave()
        this.close()
      })
  }
}
