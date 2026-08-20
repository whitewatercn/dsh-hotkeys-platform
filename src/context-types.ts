/**
 * HotkeyService 类型 + cordis Context 增补。
 *
 * 消费插件 `import type {} from 'dsh-hotkeys-platform'` 即触发
 * `declare module 'cordis' { interface Context { hotkeys: HotkeyService } }`
 * 的类型合并，拿到 `ctx.hotkeys` 的类型（编译期擦除，无运行时依赖）。
 */

import type { Context } from 'cordis'
import type { HotkeyScope } from './scope'
import type { Combo } from './combo'

export interface HotkeyActionContext {
  target: HTMLElement | null
  /** 合成一次裸 Enter（触发 DSH 原生发送等），自动防重入。 */
  dispatchEnter(el: HTMLElement): void
  /** 在光标处插入文本并触发 input（React 受控组件友好）。 */
  insertTextAtCaret(el: HTMLTextAreaElement, text: string): void
  /** 是否有打开的 overlay（命令菜单/下拉/对话框）。 */
  hasOpenOverlay(): boolean
  /** 事件目标是否为可编辑文本区。 */
  isEditableTarget(el: EventTarget | null): boolean
}

export interface HotkeyActionDescriptor {
  /** 唯一 id；建议包前缀 'my-plugin:send-message'。 */
  id: string
  /** 标题（i18n 友好：字符串或返回字符串的函数）。 */
  title: string | (() => string)
  /** 描述，显示在设置页。 */
  description?: string
  /** 动作分组（设置页分区展示）。 */
  group?: string
  /** 默认组合键，如 'Control+Enter'；用户未改时生效。空串 = 默认不绑。 */
  defaultKey?: string
  /** 触发范围。 */
  scope?: HotkeyScope
  /** scope='custom' 时的精确判定；target 命中才触发。 */
  target?: (el: HTMLElement) => boolean
  /**
   * 命中后的处理。返回 false 表示「不消费，放行给后续动作/DSH 原生行为」；
   * 返回 undefined/true 表示「已消费」。
   */
  handler(event: KeyboardEvent, ctx: HotkeyActionContext): void | boolean
  /** 设置页是否显示该动作（默认 true）。 */
  hidden?: boolean
  /** 排序（升序）。 */
  order?: number
}

/** 服务单调能力清单（只增不删）。 */
export type HotkeyFeature = 'record' | 'subscribe' | 'effectiveKey'

export interface HotkeyService {
  /** 注册一个快捷键动作；返回 disposer（HMR-safe，卸载自动撤销）。 */
  registerAction(descriptor: HotkeyActionDescriptor): () => void

  /** 当前已注册的动作快照（含被禁用的；按 order 升序）。 */
  getActions(): readonly HotkeyActionDescriptor[]

  /** 用户显式改过的绑定表：actionId -> combo（不含未改的）。 */
  getBindings(): Readonly<Record<string, string>>

  /** 一个动作当前生效的键（用户绑定 ?? 默认键 ?? null；显式禁用返回 null）。 */
  effectiveKey(actionId: string): string | null

  /** 设置/清除一个动作的用户绑定；combo='' 表示显式禁用。 */
  setBinding(actionId: string, combo: string): void

  /** 进入录制态，捕获下一个组合键并返回描述串（Esc/超时返回 null）。 */
  record(actionId: string): Promise<string | null>

  /** 订阅注册表/绑定变化；返回 disposer。 */
  subscribe(listener: () => void): () => void

  /** 单调能力清单。 */
  readonly features: readonly HotkeyFeature[]
  readonly version: string
}

/** 解析后的「动作 + 生效键 + 解析组合键」的内部视图（分发器用）。 */
export interface ResolvedAction {
  descriptor: HotkeyActionDescriptor
  /** 当前生效的组合键（禁用时为 null）。 */
  combo: Combo | null
}

declare module 'cordis' {
  interface Context {
    hotkeys: HotkeyService
    /**
     * Register a lifecycle callback (DSH-vendored cordis): runs at plugin
     * activation; its returned cleanup runs at disposal.
     */
    effect(fn: () => void | (() => void), label?: string): void
    /** Publish a service to the cordis context (DSH-vendored). */
    provide(name: string, service: unknown): void
    /** Lazily read an optional service by name (DSH-vendored). */
    get<T = unknown>(name: string): T | undefined
    /** The client slot registry (`ctx.slots`); optional. */
    slots?: {
      inject(key: string, callback: () => (() => void)): () => void
      register(options: Record<string, unknown>, render: (props: unknown) => unknown): () => void
    }
  }
}

export type { Context }
