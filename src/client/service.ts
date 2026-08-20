/**
 * HotkeyService 实现工厂。
 * 持有注册表（actions）+ 绑定表（bindings）+ 全局 keydown 分发 + 录制。
 * 所有副作用（监听/计时）通过 disposer 由 Cordis fiber 管理。
 */

import type { HotkeyService, HotkeyActionDescriptor, HotkeyActionContext } from '../context-types'
import { STORAGE_KEY, LEGACY_STORAGE_KEY, loadStorage, migrateLegacy, serializeStorage, effectiveKey } from '../store'
import { createDispatchEnter, createToaster, hasOpenOverlay, insertTextAtCaret } from './dom-utils'
import { resolveEntries, buildKeydownListener, SYNTHETIC_FLAG } from './dispatcher'
import { recordCombo } from './record'
import { isEditableTarget } from '../scope'

export const PLATFORM_VERSION = '0.1.0'
export const FEATURES = ['record', 'subscribe', 'effectiveKey', 'clearBinding'] as const

export interface ServiceDeps {
  /** localStorage 访问（可注入 fake，便于测试）。 */
  storage: Pick<Storage, 'getItem' | 'setItem'>
  /** 可选：命令注册（commandUi.register）；不可用时命令入口自动跳过。 */
  commandUi?: {
    register: (cmd: unknown) => () => void
  } | null
}

export function createHotkeyService(deps: ServiceDeps): HotkeyService {
  const storage = deps.storage
  const toast = createToaster()

  // 首次启动迁移旧 dsh-hotkeys 配置。
  let bindings: Record<string, string> = loadStorage(readRaw(STORAGE_KEY)).bindings
  if (Object.keys(bindings).length === 0) {
    const migrated = migrateLegacy(readRaw(LEGACY_STORAGE_KEY))
    if (Object.keys(migrated).length > 0) {
      bindings = migrated
      persist()
    }
  }

  const actions = new Map<string, HotkeyActionDescriptor>()
  const listeners = new Set<() => void>()

  function readRaw(key: string): string | null {
    try {
      return storage.getItem(key)
    } catch {
      return null
    }
  }

  function persist(): void {
    try {
      storage.setItem(STORAGE_KEY, serializeStorage({ version: 1, bindings }))
    } catch {
      // localStorage 不可用（隐私模式）时静默降级：仅本次会话生效
    }
  }

  function sortedActions(): HotkeyActionDescriptor[] {
    return [...actions.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }

  function notify(): void {
    for (const l of listeners) {
      try { l() } catch { /* 忽略订阅回调异常 */ }
    }
  }

  const dispatchEnter = createDispatchEnter()

  function makeActionContext(event: KeyboardEvent): HotkeyActionContext {
    const target = event.target instanceof HTMLElement ? event.target : null
    return {
      target,
      dispatchEnter: (el) => dispatchEnter(el),
      insertTextAtCaret,
      hasOpenOverlay,
      isEditableTarget,
    }
  }

  // 录制态（分发器让位）。
  let recording = false

  const onKeyDown = buildKeydownListener(
    () => resolveEntries(sortedActions(), bindings),
    {
      isComposing: (event) => event.isComposing === true || event.keyCode === 229,
      hasOpenOverlay,
      isSynthetic: (event) => (event as unknown as Record<string, unknown>)[SYNTHETIC_FLAG] === true,
      isRecording: () => recording,
    },
    makeActionContext,
  )

  const removeKeydown = (): void => {
    document.removeEventListener('keydown', onKeyDown, { capture: true })
  }
  document.addEventListener('keydown', onKeyDown, { capture: true })

  const service: HotkeyService = {
    registerAction(descriptor: HotkeyActionDescriptor): () => void {
      if (actions.has(descriptor.id)) {
        throw new Error(`dsh-hotkeys-platform: action id "${descriptor.id}" already registered`)
      }
      actions.set(descriptor.id, descriptor)
      notify()
      return () => {
        actions.delete(descriptor.id)
        notify()
      }
    },

    getActions(): readonly HotkeyActionDescriptor[] {
      return sortedActions()
    },

    getBindings(): Readonly<Record<string, string>> {
      return { ...bindings }
    },

    effectiveKey(actionId: string): string | null {
      const descriptor = actions.get(actionId)
      return effectiveKey(bindings, actionId, descriptor?.defaultKey)
    },

    setBinding(actionId: string, combo: string): void {
      bindings[actionId] = String(combo ?? '')
      persist()
      notify()
    },

    clearBinding(actionId: string): void {
      if (!(actionId in bindings)) return
      delete bindings[actionId]
      persist()
      notify()
    },

    async record(actionId: string): Promise<string | null> {
      const descriptor = actions.get(actionId)
      if (!descriptor) return null
      if (recording) return null
      recording = true
      try {
        const title = typeof descriptor.title === 'function' ? descriptor.title() : descriptor.title
        const combo = await recordCombo({ toast, title })
        if (combo !== null) {
          bindings[actionId] = combo
          persist()
          notify()
        }
        return combo
      } finally {
        recording = false
      }
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    features: FEATURES,
    version: PLATFORM_VERSION,
  }

  // 暴露给 Cordis fiber 的 disposer（停止时移除监听 + 命令 + 清空注册表）。
  // 注意：此 disposer 由调用方（apply）通过 ctx.effect 持有。
  ;(service as unknown as { _dispose: () => void })._dispose = () => {
    removeKeydown()
    listeners.clear()
    actions.clear()
  }

  return service
}

/**
 * 装配成「带 disposer 的服务」，供 apply 里 `ctx.effect(() => provide(...))` 使用。
 * 返回 { service, dispose }。
 */
export function mountHotkeyService(deps: ServiceDeps): { service: HotkeyService; dispose: () => void } {
  const service = createHotkeyService(deps)
  const dispose = (service as unknown as { _dispose: () => void })._dispose
  return { service, dispose }
}
