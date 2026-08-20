/**
 * 事件分发器（核心）。全局单一 capture keydown 监听，遍历注册动作，
 * 统一前置守卫，按 order 升序匹配组合键 + scope，命中后调用 handler。
 *
 * 分发决策抽为纯函数 `resolveDispatch`（可测），DOM 守卫与合成派发
 * 作为依赖注入，便于单测用假事件与假守卫。
 */

import type { HotkeyActionDescriptor, HotkeyActionContext } from '../context-types'
import { matchCombo, parseCombo, type Combo } from '../combo'
import { scopeMatches, type HotkeyScope } from '../scope'

/** 合成事件标记（dispatchEnter 派发的裸 Enter，识别后直接放行）。 */
export const SYNTHETIC_FLAG = '__dshHotkeysSynthetic'

export interface ResolvedEntry {
  descriptor: HotkeyActionDescriptor
  /** 当前生效组合键；显式禁用或无效为 null。 */
  combo: Combo | null
}

export interface DispatchDeps {
  /** 事件是否处于 IME 合成中。 */
  isComposing: (event: KeyboardEvent) => boolean
  /** 是否有打开的 overlay。 */
  hasOpenOverlay: () => boolean
  /** 事件是否带合成标记（平台派发的裸 Enter）。 */
  isSynthetic: (event: KeyboardEvent) => boolean
  /** 录制态判定（录制中分发器让位给录制监听）。 */
  isRecording: () => boolean
}

/** 把「描述符 + 绑定表」解析为「生效组合键」内部视图。 */
export function resolveEntries(
  descriptors: readonly HotkeyActionDescriptor[],
  bindings: Record<string, string>,
): ResolvedEntry[] {
  const out: ResolvedEntry[] = []
  for (const d of descriptors) {
    const bound = bindings[d.id]
    if (bound === '') {
      out.push({ descriptor: d, combo: null }) // 显式禁用
      continue
    }
    const raw = bound ?? d.defaultKey ?? ''
    const combo = parseCombo(raw)
    out.push({ descriptor: d, combo: combo.key ? combo : null })
  }
  return out
}

export interface DispatchResult {
  /** 命中的动作描述符；未命中为 null。 */
  action: HotkeyActionDescriptor | null
  /** 是否已消费（命中且 handler 返回非 false）。 */
  consumed: boolean
}

/**
 * 纯分发决策：给定事件与解析后的动作表，返回命中的动作。
 * 守卫通过 deps 注入；scope='custom' 用 descriptor.target 判定。
 * 不调用 handler，只决定命中谁。
 */
export function resolveDispatch(
  entries: ResolvedEntry[],
  event: KeyboardEvent,
  deps: DispatchDeps,
): HotkeyActionDescriptor | null {
  if (deps.isSynthetic(event)) return null
  if (deps.isRecording()) return null
  if (deps.isComposing(event)) return null
  if (deps.hasOpenOverlay()) return null

  const ctx: { target: EventTarget | null; hasOpenOverlay: () => boolean } = {
    target: event.target,
    hasOpenOverlay: deps.hasOpenOverlay,
  }

  for (const entry of entries) {
    if (!entry.combo) continue // 禁用
    if (!matchCombo(event, entry.combo)) continue
    const scope = entry.descriptor.scope ?? 'global'
    if (!scopeMatches(scope as HotkeyScope, ctx, entry.descriptor.target)) continue
    return entry.descriptor
  }
  return null
}

/**
 * 构建全局 keydown 监听（capture）。遍历动作表，命中后调用 handler；
 * handler 返回 false 表示「不消费」，继续下一动作；否则停止传播并视为已消费。
 */
export function buildKeydownListener(
  resolveEntriesNow: () => ResolvedEntry[],
  deps: DispatchDeps,
  makeActionContext: (event: KeyboardEvent) => HotkeyActionContext,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    const entries = resolveEntriesNow()
    const hit = resolveDispatch(entries, event, deps)
    if (!hit) return
    const result = hit.handler(event, makeActionContext(event))
    if (result === false) return // 不消费，放行
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
