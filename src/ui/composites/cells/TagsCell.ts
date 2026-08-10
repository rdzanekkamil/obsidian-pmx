import { renderTagChip } from '../tagChip'

export class TagsCell {
  el: HTMLTableCellElement

  constructor(parentRow: HTMLElement, tags: string[], showTagColors: boolean) {
    this.el = parentRow.createEl('td', { cls: 'pm-table-cell pm-table-cell-tags' })
    if (tags.length) {
      for (const tag of tags) {
        renderTagChip(this.el, tag, showTagColors)
      }
    }
  }
}
