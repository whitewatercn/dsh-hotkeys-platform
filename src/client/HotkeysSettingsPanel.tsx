/**
 * 快捷键设置页（settings.section 的 content）。
 * 注册表驱动：列出所有动作（分组 → order），显示生效键，录制/禁用，
 * 冲突高亮。用 useSyncExternalStore 订阅服务变化。
 */

import { useSyncExternalStore } from 'react'
import type { HotkeyService, HotkeyActionDescriptor } from '../context-types'
import classes from './hotkeys-settings.module.css'

function useHotkeys(service: HotkeyService) {
  return useSyncExternalStore(
    (cb) => service.subscribe(cb),
    () => service.getActions(),
  )
}

/** 冲突检测：组合键 → 动作 id 列表。 */
function computeConflicts(service: HotkeyService): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const action of service.getActions()) {
    if (action.hidden) continue
    const key = service.effectiveKey(action.id)
    if (!key) continue
    const list = map.get(key) ?? []
    list.push(action.id)
    map.set(key, list)
  }
  const conflicts = new Map<string, string[]>()
  for (const [key, ids] of map) {
    if (ids.length > 1) conflicts.set(key, ids)
  }
  return conflicts
}

function actionTitle(action: HotkeyActionDescriptor): string {
  return typeof action.title === 'function' ? action.title() : action.title
}

export function HotkeysSettingsPanel(props: { service: HotkeyService } & Record<string, unknown>): JSX.Element {
  const { service } = props
  const actions = useHotkeys(service)
  const conflicts = computeConflicts(service)

  const groups = new Map<string, HotkeyActionDescriptor[]>()
  for (const a of actions) {
    if (a.hidden) continue
    const g = a.group ?? '未分组'
    const list = groups.get(g) ?? []
    list.push(a)
    groups.set(g, list)
  }

  return (
    <div className={classes.panel}>
      <div className={classes.hint}>
        快捷键平台：插件注册的每个动作都可在此配置。录制后按键即生效；同一组合键被多个动作使用时，先注册者优先（冲突已高亮）。
      </div>

      {actions.length === 0 && (
        <div className={classes.empty}>暂无插件注册快捷键动作。</div>
      )}

      {[...groups.entries()].map(([group, list]) => (
        <section key={group} className={classes.group}>
          <div className={classes.groupTitle}>{group}</div>
          {list.map((action) => {
            const key = service.effectiveKey(action.id)
            const userBound = service.getBindings()[action.id] !== undefined
            const disabled = key === null && userBound
            const isConflict = key !== null && conflicts.has(key)
            return (
              <div key={action.id} className={isConflict ? `${classes.row} ${classes.conflict}` : classes.row}>
                <div className={classes.rowMain}>
                  <div className={classes.rowTitle}>{actionTitle(action)}</div>
                  {action.description && <div className={classes.rowDesc}>{action.description}</div>}
                  <div className={classes.rowId}>{action.id}</div>
                </div>
                <div className={classes.rowActions}>
                  <span className={classes.key}>
                    {key ?? (disabled ? '已禁用' : '未绑定')}
                  </span>
                  <button className={classes.btn} onClick={() => { void service.record(action.id) }}>
                    录制
                  </button>
                  {userBound && (
                    <button
                      className={`${classes.btn} ${classes.btnGhost}`}
                      onClick={() => service.setBinding(action.id, '')}
                    >
                      禁用
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
