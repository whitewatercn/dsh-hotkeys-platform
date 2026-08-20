/**
 * 录制：进入录制态，捕获下一个组合键并返回描述串。
 * Esc 取消、15s 超时、纯修饰键提示重按。
 */

import { describeCombo } from '../combo'

export interface RecordOptions {
  /** 提示（toast）。 */
  toast: (message: string) => void
  /** 录制超时（ms）。 */
  timeoutMs?: number
  /** 动作标题（提示语用）。 */
  title: string
}

/**
 * 进入录制态；resolve 返回捕获到的组合键串，或 null（Esc/超时）。
 * 录制监听挂 document（capture），录制期间分发器让位（isRecording 返回 true）。
 */
export function recordCombo(opts: RecordOptions): Promise<string | null> {
  const { toast, title } = opts
  const timeoutMs = opts.timeoutMs ?? 15000

  return new Promise<string | null>((resolve) => {
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      document.removeEventListener('keydown', handler, { capture: true })
      resolve(value)
    }

    const timeout = setTimeout(() => {
      finish(null)
      toast('录制超时，已取消')
    }, timeoutMs)

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        finish(null)
        toast('已取消录制')
        return
      }
      const combo = describeCombo(event)
      if (!combo) {
        toast('请同时按下组合键（如 Ctrl+Shift+Enter）')
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(combo)
      toast(`「${title}」键已设为 ${combo}`)
    }

    document.addEventListener('keydown', handler, { capture: true })
    toast(`请按下新的「${title}」组合键（Esc 取消）`)
  })
}
