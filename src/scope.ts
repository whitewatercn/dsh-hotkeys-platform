/**
 * 内置触发范围（scope）判定（纯函数，可测）。
 *
 * 平台统一做 scope 命中判定；守卫（IME / overlay / editable）在分发器里
 * 前置统一执行（见 client/dispatcher.ts）。这里只回答「当前事件目标是否
 * 属于该 scope」。
 */

export type HotkeyScope =
  | 'global'          // 任意处（默认）
  | 'input'           // 可编辑文本区（textarea/input[type=text]）
  | 'question-card'   // DeepSeek 提问卡内（[data-question-key] 内）
  | 'command-palette' // 命令菜单/下拉打开时
  | 'custom'          // 需要自定义 target 判定

export interface ScopeContext {
  target: EventTarget | null
  /** 是否有打开的 overlay（命令菜单/下拉/对话框）。 */
  hasOpenOverlay: () => boolean
}

function asElement(target: EventTarget | null): Element | null {
  if (typeof Element === 'undefined') return null
  return target instanceof Element ? target : null
}

/** 目标是否位于可编辑文本区。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = asElement(target)
  if (!el) return false
  if (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) return true
  if (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) {
    return el.type === 'text' || el.type === 'search' || el.type === ''
  }
  return false
}

/** 目标是否位于 DeepSeek 提问卡（[data-question-key]）内的输入框。 */
export function isQuestionCardTarget(target: EventTarget | null): boolean {
  const el = asElement(target)
  if (!el) return false
  const edit = el.closest('input[type="text"], textarea')
  if (!edit) return false
  return edit.closest('[data-question-key]') !== null
}

/** 判定 scope 是否命中；'custom' 需额外传入 target 函数。 */
export function scopeMatches(
  scope: HotkeyScope,
  ctx: ScopeContext,
  customTarget?: (el: HTMLElement) => boolean,
): boolean {
  switch (scope) {
    case 'global':
      return true
    case 'input':
      return isEditableTarget(ctx.target)
    case 'question-card':
      return isQuestionCardTarget(ctx.target)
    case 'command-palette':
      return ctx.hasOpenOverlay()
    case 'custom': {
      const el = asElement(ctx.target)
      if (!el || typeof customTarget !== 'function') return false
      return customTarget(el as HTMLElement)
    }
    default:
      return false
  }
}
