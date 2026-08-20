/**
 * dsh-hotkeys-platform client half。
 *
 * apply() 里：
 *   1. ctx.provide('hotkeys', service) —— 发布注册表服务；
 *   2. 在 settings.section 注册「快捷键」分区（设置页）；
 *   3. 注册 /hotkeys 命令（commandUi 可选探测）。
 * 所有副作用包在 ctx.effect 里，停止/卸载时自动撤销。
 */

import type { Context } from '../context-types'
import { mountHotkeyService } from './service'
import { HotkeysSettingsPanel } from './HotkeysSettingsPanel'
import type { HotkeyService } from '../context-types'

export const name = 'dsh-hotkeys-platform'

export function apply(ctx: Context): void {
  ctx.effect(() => {
    // 1. 服务：localStorage 持久化 + 全局分发。
    const { service, dispose } = mountHotkeyService({ storage: window.localStorage })

    let disposeSlot = () => {}
    let disposeCommand = () => {}

    // 2. 设置页分区。
    const slots = ctx.get('slots') as
      | { inject(key: string, callback: () => () => void): () => void
          register(options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): () => void }
      | undefined
    if (slots && typeof slots.inject === 'function') {
      disposeSlot = slots.inject('settings.section', () =>
        slots.register(
          {
            name: 'settings.section',
            id: 'hotkeys',
            order: 150,
            label: () => '快捷键',
            inject: () => ({ service }),
          },
          HotkeysSettingsPanel as (props: Record<string, unknown>) => unknown,
        ),
      )
    }

    // 3. /hotkeys 命令（可选）。
    try {
      const commandUi = ctx.get('commandUi') as unknown as {
        register?: (cmd: unknown) => () => void
      } | undefined
      if (commandUi && typeof commandUi.register === 'function') {
        disposeCommand = commandUi.register({
          name: 'hotkeys',
          description: '查看/录制快捷键绑定',
          available: () => true,
          ui: {
            kind: 'popupSelect',
            options: async () => {
              const actions = service.getActions().filter((a) => !a.hidden)
              return actions.map((a) => {
                const title = typeof a.title === 'function' ? a.title() : a.title
                const key = service.effectiveKey(a.id)
                return {
                  id: `record:${a.id}`,
                  label: `🎙 录制「${title}」键（当前 ${key ?? '未绑定'}）`,
                }
              })
            },
            onSelect: (option: { id?: string } | null) => {
              if (!option || !option.id?.startsWith('record:')) return
              const actionId = option.id.slice('record:'.length)
              void service.record(actionId)
            },
          },
        })
      }
    } catch {
      // commandUi 不可用：核心键位分发不受影响。
    }

    return () => {
      disposeCommand()
      disposeSlot()
      dispose()
    }
  })
}

// 供 client bundle 在无 type 场景下引用 HotkeyService 类型（保持导出无副作用）。
export type { HotkeyService }
