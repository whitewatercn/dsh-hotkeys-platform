/**
 * client 侧 DOM 工具：overlay 判定、合成 Enter、光标插入、轻量 toast。
 * 与 src/scope.ts 的纯判定分离：这里的函数依赖真实 DOM。
 */

/** 是否有打开的弹出层（命令菜单/下拉/对话框），此时按键应放行给菜单选择。 */
export function hasOpenOverlay(): boolean {
  if (typeof document === 'undefined') return false
  const nodes = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [role="combobox"][aria-expanded="true"]')
  for (const el of nodes) {
    if (el.getClientRects().length > 0) return true
  }
  return false
}

/** 在光标处插入文本，并让 React 受控组件感知（触发 input 事件）。 */
export function insertTextAtCaret(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length
  textarea.setRangeText(text, start, end, 'end')
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.focus()
}

/**
 * 合成一次裸 Enter 派发的工厂（防重入）。
 * 合成的裸 Enter 会被平台 capture 监听再次拦截，因此事件上打
 * `__dshHotkeysSynthetic` 标记，分发器识别后直接放行。
 */
export function createDispatchEnter(): (el: HTMLElement) => void {
  let dispatching = false
  return (el: HTMLElement) => {
    if (dispatching) return
    dispatching = true
    try {
      const ev = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      })
      ;(ev as unknown as { __dshHotkeysSynthetic?: boolean }).__dshHotkeysSynthetic = true
      el.dispatchEvent(ev)
    } finally {
      dispatching = false
    }
  }
}

/** 轻量提示（纯 DOM，不依赖 React）。 */
export function createToaster() {
  let toastEl: HTMLDivElement | null = null
  let toastTimer = 0
  return (message: string) => {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div')
        toastEl.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483000;' +
          'background:rgba(20,22,28,.92);color:#fff;padding:8px 16px;border-radius:8px;' +
          'font:13px/1.5 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;'
        document.body.appendChild(toastEl)
      }
      toastEl.textContent = message
      toastEl.style.display = 'block'
      clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => { if (toastEl) toastEl.style.display = 'none' }, 2600)
    } catch {
      // 提示失败不影响核心功能
    }
  }
}
