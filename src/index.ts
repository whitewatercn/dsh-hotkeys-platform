/**
 * dsh-hotkeys-platform host half。
 *
 * 平台核心在 client（注册表 + 分发 + UI）。host 侧仅预留一个可选的
 * hotkeys 设置命名空间（供需要 host 侧参与的配置扩展），其余留空。
 * 需 host 能力的动作由各插件自带路由，平台不关心。
 */

export const name = 'dsh-hotkeys-platform'

/**
 * @param {import('./context-types').Context} ctx
 */
export function apply(ctx: import('./context-types').Context): void {
  ctx.effect(() => {
    // 预留：后期可在这里注册 hotkeys 设置命名空间或读取 $DSH_HOME/settings.yaml
    return () => {}
  })
}
