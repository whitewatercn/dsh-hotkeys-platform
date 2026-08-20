/**
 * 组合键解析 / 匹配 / 描述（纯函数，可测）。
 *
 * 组合键字符串格式：`"Control+Shift+Enter"`。修饰键别名：
 *   ctrl/control/⌃ → ctrl；meta/cmd/command/win/⌘ → meta；
 *   shift/⇧ → shift；alt/option/⌥ → alt。
 * 最后一个非修饰 token 作为主键（key）。
 */

export interface Combo {
  key: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

const MODIFIER_ALIASES: Record<string, keyof Pick<Combo, 'ctrl' | 'meta' | 'shift' | 'alt'>> = {
  ctrl: 'ctrl', control: 'ctrl', '⌃': 'ctrl',
  meta: 'meta', cmd: 'meta', command: 'meta', win: 'meta', '⌘': 'meta',
  shift: 'shift', '⇧': 'shift',
  alt: 'alt', option: 'alt', '⌥': 'alt',
}

/** 空组合键（无绑定 / 显式禁用）。 */
export const EMPTY_COMBO: Combo = { key: '', ctrl: false, meta: false, shift: false, alt: false }

/** "Control+Shift+Enter" → { key:'Enter', ctrl:true, shift:true, meta:false, alt:false } */
export function parseCombo(text: string): Combo {
  const combo: Combo = { key: '', ctrl: false, meta: false, shift: false, alt: false }
  for (const part of String(text ?? '').split('+')) {
    const token = part.trim()
    if (!token) continue
    const mod = MODIFIER_ALIASES[token.toLowerCase()]
    if (mod) {
      combo[mod] = true
    } else {
      combo.key = token // 最后一个非修饰 token 作为主键
    }
  }
  return combo
}

/** KeyboardEvent → 组合键字符串（录制时使用）；纯修饰键返回 null。 */
export function describeCombo(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.metaKey) parts.push('Meta')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(key)
  return parts.join('+')
}

/** 事件是否命中某组合键。 */
export function matchCombo(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  combo: Combo,
): boolean {
  if (!combo || !combo.key) return false
  if (event.key.toLowerCase() !== combo.key.toLowerCase()) return false
  if (!!event.ctrlKey !== !!combo.ctrl) return false
  if (!!event.metaKey !== !!combo.meta) return false
  if (!!event.shiftKey !== !!combo.shift) return false
  if (!!event.altKey !== !!combo.alt) return false
  return true
}

/**
 * Combo → 组合键字符串（`formatCombo` 的逆）。
 * 修饰键按 Ctrl/Meta/Alt/Shift 固定顺序，主键在最后。
 * 主键为空返回 ''（表示无绑定/显式禁用）。
 */
export function formatCombo(combo: Combo): string {
  if (!combo || !combo.key) return ''
  const parts: string[] = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.meta) parts.push('Meta')
  if (combo.alt) parts.push('Alt')
  if (combo.shift) parts.push('Shift')
  parts.push(combo.key)
  return parts.join('+')
}

/** 组合键是否「无任何绑定」（主键为空）。 */
export function isEmptyCombo(combo: Combo): boolean {
  return !combo.key
}

/** 组合键是否为「裸 Enter」（无任何修饰键）。 */
export function isPlainEnter(combo: Combo): boolean {
  return combo.key === 'Enter' && !combo.ctrl && !combo.meta && !combo.shift && !combo.alt
}

/** 组合键是否为「Enter 系」（主键为 Enter，裸的或带修饰的）。 */
export function isEnterFamily(combo: Combo): boolean {
  return combo.key === 'Enter'
}
