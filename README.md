# dsh-hotkeys-platform

**DeepSeek Harness（DSH）Web 插件：快捷键设定平台。**

把「每个插件各自拦截键盘、各写各的设置」升级为**一个注册表服务** `ctx.hotkeys`：

- 任何插件通过 `ctx.hotkeys.registerAction(...)` 注册「动作 → 处理器」；
- 动作的默认键、触发范围（scope）、描述由插件声明；
- 用户的**显式改键**统一持久化在平台；
- 设置页（DSH 设置 → 快捷键）与 `/hotkeys` 命令提供统一配置。

架构与 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 同构：平台 `ctx.provide('hotkeys', service)`，业务动作由消费插件注册（吃狗粮），能力对等。

---

## 快速开始（消费插件）

```ts
export const inject = ['hotkeys']

export function apply(ctx: Context): void {
  ctx.effect(() =>
    ctx.hotkeys.registerAction({
      id: 'my-plugin:send-message',
      title: () => t('发送'),
      description: '发送当前消息',
      group: '消息',
      scope: 'input',
      defaultKey: 'Control+Enter',
      handler: (event, h) => {
        // 命中后的处理；返回 false 表示「不消费，放行给 DSH 原生行为」。
        h.dispatchEnter(h.target ?? event.target)
      },
    })
  )
}
```

要点：

- `inject = ['hotkeys']` 让 Cordis 在平台就绪后才激活你的插件（`ctx.hotkeys` 恒存在）；
- `registerAction` 返回 disposer，**必须**包在 `ctx.effect(...)` 里（HMR-safe）；
- `id` 建议包前缀（`my-plugin:xxx`），避免冲突。

---

## 动作描述符

| 字段 | 说明 |
|---|---|
| `id` | 唯一 id，建议包前缀 |
| `title` | 标题（字符串或 `() => string`，i18n 友好） |
| `description` | 描述，显示在设置页 |
| `group` | 分组（设置页分区展示） |
| `defaultKey` | 默认组合键，如 `'Control+Enter'`；空串 = 默认不绑 |
| `scope` | `global` / `input` / `question-card` / `command-palette` / `custom` |
| `target` | `scope='custom'` 时的精确判定 `(el) => boolean` |
| `handler` | `(event, ctx) => void | false`；返回 `false` 表示不消费、放行 |
| `hidden` | 设置页隐藏（默认 false） |
| `order` | 排序（升序，默认 100） |

**内置 scope**：

| scope | 判定 |
|---|---|
| `global` | 任意处 |
| `input` | 可编辑文本区（textarea / input[type=text]） |
| `question-card` | DeepSeek 提问卡（`[data-question-key]`）内 |
| `command-palette` | 命令菜单/下拉打开时 |
| `custom` | 自定义 `target(el)` 判定 |

**Handler 上下文 `ctx`**：`target`（事件目标）、`dispatchEnter(el)`（合成裸 Enter，防重入）、`insertTextAtCaret(el, text)`、`hasOpenOverlay()`、`isEditableTarget(el)`。

---

## 服务 API

```ts
interface HotkeyService {
  registerAction(d: HotkeyActionDescriptor): () => void
  getActions(): readonly HotkeyActionDescriptor[]
  getBindings(): Readonly<Record<string, string>>   // 只存用户改过的
  effectiveKey(actionId: string): string | null     // 用户绑定 ?? 默认 ?? null（禁用）
  setBinding(actionId: string, combo: string): void // combo='' 表示显式禁用
  record(actionId: string): Promise<string | null>  // 录制
  subscribe(listener: () => void): () => void
  readonly features: readonly string[]              // 'record' | 'subscribe' | 'effectiveKey'
  readonly version: string
}
```

---

## 持久化与语义

- localStorage 键 `dsh.hotkeys.v1`，只存用户显式改过的 `{ actionId: combo }`；
- **三态**：未出现（回落 `defaultKey`）/ 具体串（用户绑定）/ `''`（显式禁用，连默认也关掉）；
- 迁移：首次启动自动从旧 `dsh-hotkeys` 的 `dsh.sendkeys.v1` 迁非默认绑定（保留旧键）。

---

## 安装

```bash
dsh plugin --profile web add dsh-hotkeys-platform
# 或本地开发
dsh plugin --profile web add link:<本仓库路径>
```

重启 `dsh web`（host 改动需重启；client 改动浏览器强刷）。

---

## 构建与测试

```bash
pnpm install
pnpm typecheck
pnpm test      # vitest 单测（combo / scope / store / dispatcher）
pnpm build     # tsc 声明 + tsdown（host ESM + client.js + client-registry.js）
```

---

## 目录

```
src/
├── index.ts               # host half（可选设置命名空间，其余留空）
├── combo.ts               # 组合键解析/匹配/描述（纯函数）
├── scope.ts               # 内置 scope 判定（纯函数）
├── store.ts               # bindings 持久化 + 迁移（纯函数）
├── context-types.ts       # HotkeyService 类型 + Context 增补
└── client/
    ├── index.tsx          # apply：ctx.provide + settings.section + /hotkeys 命令
    ├── service.ts         # HotkeyService 实现工厂
    ├── dispatcher.ts      # 全局 keydown 分发（纯决策可测）
    ├── record.ts          # 录制
    ├── dom-utils.ts       # overlay/合成 Enter/toast
    └── HotkeysSettingsPanel.tsx  # 设置页
```

## License

MIT
