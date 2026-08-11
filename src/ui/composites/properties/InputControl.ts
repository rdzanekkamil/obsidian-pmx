import { makeInlineEdit } from '../cells/inlineEdit'

export interface InputControlOpts {
  container: HTMLElement
  value: string
  onChange: (value: string) => void
  inputType?: 'text' | 'number' | 'date' | 'textarea'
  suffix?: string
  placeholder?: string
  number?: { min?: number; max?: number }
}

/** Backs Progress. `number` rounds and clamps on commit, and is read only for inputType 'number'. */
export function renderInputControl(opts: InputControlOpts): void {
  const inputType = opts.inputType ?? 'text'
  const has = opts.value !== ''
  const trigger = opts.container.createEl('button', { cls: 'pm-prop-inline' })
  if (!has) trigger.addClass('pm-prop-inline--empty')
  trigger.createSpan({
    cls: 'pm-prop-inline-label',
    text: has ? `${opts.value}${opts.suffix ?? ''}` : (opts.placeholder ?? 'Set value')
  })

  trigger.addEventListener('click', () => {
    if (inputType === 'textarea') {
      const existing = opts.container.querySelector('textarea')
      if (existing) { existing.focus(); return }
      const area = opts.container.createEl('textarea', {
        cls: 'pm-input',
        attr: { rows: '4', placeholder: opts.placeholder ?? '' }
      })
      area.value = opts.value
      area.focus()
      area.addEventListener('blur', () => {
        opts.onChange(area.value)
        area.detach()
      })
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { area.detach(); trigger.style.display = '' }
      })
      trigger.style.display = 'none'
      return
    }
    makeInlineEdit({
      container: opts.container,
      display: trigger,
      inputType,
      value: opts.value,
      onSave: async (v) => {
        opts.onChange(inputType === 'number' && opts.number ? clampNumber(v, opts.number) : v)
      }
    })
  })
}

function clampNumber(raw: string, bounds: { min?: number; max?: number }): string {
  const rounded = Math.round(parseFloat(raw) || 0)
  return String(Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, rounded)))
}
