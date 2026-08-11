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

    this.renderHeader(project, plugin)
    this.renderTimeline(project)
  }

  refresh(): void {
    this.render()
  }

  // ── Header ───────────────────────────────────────────────────────────────

  private renderHeader(project: Project, plugin: PMPlugin): void {
    const header = this.container.createDiv('pm-versions-header')

    const headerLeft = header.createDiv('pm-versions-header-left')
    const icon = headerLeft.createSpan({ text: '⎇', cls: 'pm-ver-icon' })
    icon.style.fontSize = '16px'
    headerLeft.createEl('h2', { text: 'Releases' })

    const headerRight = header.createDiv('pm-versions-header-right')
    const toggle = headerRight.createEl('button', { cls: 'pm-versions-toggle-btn' })
    toggle.setText(this.showReleased ? 'hide released' : 'show released')
    if (this.showReleased) toggle.addClass('is-active')
    toggle.addEventListener('click', () => {
      this.showReleased = !this.showReleased
      this.render()
    })

    new ButtonComponent(headerRight)
      .setButtonText('+ new release')
      .setCta()
      .onClick(() => openVersionModal(plugin, project, null, () => { void this.ctx.onRefresh() }))
  }

  // ── Timeline ─────────────────────────────────────────────────────────────

  private renderTimeline(project: Project): void {
    const list = this.container.createDiv('pm-versions-timeline')

    const visible = project.versions.filter((v) => this.showReleased || !v.releasedAt)

    if (!visible.length) {
      const empty = this.container.createDiv('pm-versions-empty')
      const icon = empty.createDiv('pm-versions-empty-icon')
      setIcon(icon, 'git-branch')
      empty.createEl('p', {
        text: project.versions.length
          ? 'All releases are out. Toggle "show released" to see them.'
          : 'No releases yet. Create your first release above.'
      })
      return
    }

    for (const version of visible) {
      this.renderVersionEntry(list, version)
    }
  }

  private renderVersionEntry(container: HTMLElement, version: Version): void {
    const { project, plugin } = this.ctx
    const tasks = project.tasks.filter((t) => t.versionId === version.id)
    const done = tasks.filter((t) => t.completed).length
    const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0
    const isExpanded = !!this.expanded[version.id]
    const isReleased = !!version.releasedAt

    const entry = container.createDiv('pm-ver-entry')

    // Rail + dot
    const rail = entry.createDiv('pm-ver-rail')
    rail.createDiv('pm-ver-dot').addClass(isReleased ? 'pm-ver-dot--released' : 'pm-ver-dot--draft')
    rail.createDiv('pm-ver-rail-line')

    // Content
    const content = entry.createDiv('pm-ver-content')

    // Version tag
    const tagRow = content.createDiv('pm-ver-tag')
    const tagCode = tagRow.createDiv(
      isReleased ? 'pm-ver-tag-code pm-ver-tag-code--released' : 'pm-ver-tag-code pm-ver-tag-code--draft'
    )
    tagCode.setText(isReleased ? `✓ ${version.name}` : version.name)

    // Meta inline
    const meta = content.createDiv('pm-ver-meta-inline')
    if (version.plannedReleaseDate) {
      meta.createSpan({ text: `📅 ${version.plannedReleaseDate}` })
    }
    if (isReleased && version.releasedAt) {
      const released = meta.createSpan({ text: `✔ released ${version.releasedAt.slice(0, 10)}`, cls: 'pm-ver-ok' })
    }
    meta.createSpan({ text: `${tasks.length} task${tasks.length !== 1 ? 's' : ''}` })

    if (version.description) {
      content.createEl('p', { text: version.description, cls: 'pm-ver-desc' })
    }

    // Progress
    const prog = content.createDiv('pm-ver-progress')
    const track = prog.createDiv('pm-ver-progress-track')
    const fill = track.createDiv('pm-ver-progress-fill')
    if (progress === 0) fill.addClass('pm-ver-progress-fill--zero')
    fill.style.width = `${progress}%`
    prog.createDiv('pm-ver-progress-label').setText(`${progress}%`)

    // Expand toggle
    const taskHeader = content.createDiv('pm-ver-tasks-header')
    taskHeader.createDiv('pm-ver-tasks-label').setText('Tasks')
    const expandBtn = taskHeader.createEl('button', { cls: 'pm-ver-expand-btn' })
    expandBtn.setText(isExpanded ? '▲ collapse' : '▼ expand')
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.expanded[version.id] = !this.expanded[version.id]
      this.render()
    })

    // Task list
    if (isExpanded) {
      const taskList = content.createDiv('pm-ver-tasks')
      if (!tasks.length) {
        taskList.createDiv('pm-ver-task-empty').setText('No tasks assigned to this release.')
      } else {
        for (const task of tasks) {
          this.renderTaskRow(taskList, task)
        }
      }
    }

    // Actions
    const actions = content.createDiv('pm-ver-actions')
    if (!isReleased) {
      new ButtonComponent(actions)
        .setButtonText('Release')
        .onClick(async (e) => {
          e.stopPropagation()
          await plugin.store.releaseVersion(project, version.id)
          await this.ctx.onRefresh()
        })
    }
    new ButtonComponent(actions)
      .setButtonText('Edit')
      .onClick((e) => {
        e.stopPropagation()
        openVersionModal(plugin, project, version, () => { void this.ctx.onRefresh() })
      })
    new ButtonComponent(actions)
      .setButtonText('Delete')
      .setWarning()
      .onClick(async (e) => {
        e.stopPropagation()
        await plugin.store.deleteVersion(project, version.id)
        await this.ctx.onRefresh()
      })
  }

  private renderTaskRow(container: HTMLElement, task: Task): void {
    const { plugin, project } = this.ctx
    const config = plugin.store.configFor(project)
    const statusCfg = config.statuses.find((s) => s.id === task.status)
    const prioCfg = config.priorities.find((p) => p.id === task.priority)

    const row = container.createDiv('pm-ver-task-row')
    if (task.completed) row.addClass('pm-ver-task-row--done')

    const bar = row.createDiv('pm-ver-task-status-bar')
    bar.style.background = statusCfg?.color ?? '#6e7681'

    row.createDiv('pm-ver-task-title').setText(task.title)

    if (task.due) {
      const due = row.createDiv('pm-ver-task-due')
      due.setText(task.due)
      if (statusCfg?.complete) due.addClass('pm-ver-task-due--done')
    }

    if (task.assignees.length) {
      const chip = row.createDiv('pm-ver-task-chips').createDiv('pm-ver-task-chip')
      chip.setText(task.assignees.join(', '))
      chip.style.background = 'rgba(110, 118, 129, 0.15)'
      chip.style.color = '#6e7681'
    }

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
    contentEl.addClass('pm-modal')
    contentEl.createEl('h2', { text: this.existing ? 'Edit release' : 'New release' })

    const form = contentEl.createDiv()
    form.style.cssFloat = 'none'

    const field = (label: string, el: HTMLElement) => {
      const wrap = form.createDiv('pm-task-field')
      wrap.createEl('label', { text: label, cls: 'pm-label' }).after(el)
      return wrap
    }

    const nameInput = form.createEl('input', { type: 'text', cls: 'pm-input', attr: { style: 'width:100%;box-sizing:border-box' } })
    nameInput.value = this.name
    nameInput.placeholder = 'e.g. v1.0, sprint-5, winter-2026'
    nameInput.addEventListener('input', () => { this.name = nameInput.value })
    field('Name *', nameInput)

    const descArea = form.createEl('textarea', { cls: 'pm-input', attr: { rows: '3', style: 'width:100%;box-sizing:border-box' } })
    descArea.value = this.description
    descArea.placeholder = 'What is this release for?'
    descArea.addEventListener('input', () => { this.description = descArea.value })
    field('Description', descArea)

    const dateInput = form.createEl('input', { type: 'date', cls: 'pm-input' })
    dateInput.value = this.plannedReleaseDate
    dateInput.addEventListener('change', () => { this.plannedReleaseDate = dateInput.value })
    field('Planned release date', dateInput)

    const footer = contentEl.createDiv('pm-modal-btn-row')
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
