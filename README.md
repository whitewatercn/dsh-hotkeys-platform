
正在开发中，还不能使用


# dsh-hotkeys-platform

**DeepSeek Harness（DSH）Web 插件：快捷键设定平台。**

把「每个插件各自拦截键盘、各写各的设置」升级为**一个注册表服务** `ctx.hotkeys`：

- 任何插件通过 `ctx.hotkeys.registerAction(...)` 注册「动作 → 处理器」；
- 动作的默认键、触发范围（scope）、描述由插件声明；
- 用户的**显式改键**统一持久化在平台；
- 设置页（DSH 设置 → 快捷键）与 `/hotkeys` 命令提供统一配置。

架构与 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 同构：平台 `ctx.provide('hotkeys', service)`，业务动作由消费插件注册（吃狗粮），能力对等。

---

使用示例：[docs/example.md](./docs/example.md)  

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


### 关键点说明

| 点 | 说明 |
|---|---|
| **`ctx.get('hotkeys')` + 判空** | 平台是可选项，读不到就跳过；不要用 `inject` 之外的 `ctx.hotkeys` 直接访问 |
| **`ctx.effect` 包裹** | `registerAction` 返回 disposer，fiber 卸载（HMR/禁用）时自动撤销注册，否则下次激活抛 `already registered` |
| **`id` 用包前缀** | `dsh-better-archive:open-archived`，避免与别的插件冲突 |
| **`scope: 'global'`** | 任意处可触发；若动作只在输入框有意义，改 `scope: 'input'`；提问卡内用 `question-card`；精确判定用 `custom` + `target(el)` |
| **`handler` 返回 `false`** | 表示「不消费这次按键，放行给 DSH 原生/后续动作」——例如你想让某键只在特定条件下生效，条件不满足时 `return false` |

### 需要 host 能力的动作

如果某个快捷键动作要触发 **host 侧能力**（读写文件、执行命令、归档会话等），平台**不承载**这些逻辑——由你的插件自带 host 路由，handler 里 `fetch` 即可。例如 better-archive 的「清空全部归档」动作可以这样写：

```ts
handler: async () => {
  await fetch('/archived/delete-all', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  })
}
```

> 这正是平台「host 仅可选扩展」的设计：host 半只留一个可选的 `hotkeys` 设置命名空间，业务 host 能力一律由各插件自己的 `/路由` 提供。

### 验证

1. 重启 `dsh web`（peer 依赖新增需重启），浏览器强刷；
2. 打开「设置 → 快捷键」，应看到「归档」分组下出现「打开已归档」动作，当前键显示 `Ctrl+Shift+A`；
3. 在任意界面按下 `Ctrl+Shift+A`，应跳转到「已归档」设置页；
4. 点「录制」把键改成别的组合键，或点「禁用」整体关闭。

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
  clearBinding(actionId: string): void              // 删除绑定，回落 defaultKey
  record(actionId: string): Promise<string | null>  // 录制
  subscribe(listener: () => void): () => void
  readonly features: readonly string[]              // 'record' | 'subscribe' | 'effectiveKey' | 'clearBinding'
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

## 如何配置快捷键（用户教程）

### 入口一：设置页（推荐）

1. 打开 DSH 设置（左下角齿轮图标）。
2. 左侧导航选择「**快捷键**」分区。
3. 页面按**分组**列出所有插件注册的动作，每个动作显示标题、描述、动作 id 与当前生效键。
4. 配置操作（可视化点选 + 键盘录制，两条路写同一份绑定）：
   - **编辑（可视化）**：点动作右侧「编辑」展开组合键编辑器——
     - **修饰键**：勾选 `Ctrl` / `⌘/Win` / `Alt/⌥` / `Shift`（多选）；
     - **主键**：下拉选常用键（Enter、Space、Tab、Esc、方向键、F1-F12…），或直接输入任意键名；
     - **预览**实时显示拼出的组合键，点「保存」生效，「清除」回到默认键；
     - 好处：能配「浏览器保留键」（如 `Cmd+W`、`Ctrl+T` 录不到但可手工拼）、能精确微调单个修饰键。
   - **录制（快捷）**：点「录制」→ 提示「请按下新的组合键」→ 直接按键即完成。`Esc` 取消；15 秒无操作自动取消。
   - **禁用**：点「禁用」，该动作完全关闭（连默认键也不再触发）。
   - 已改过的动作会出现「禁用」按钮；未改过的动作使用默认键。

### 入口二：`/hotkeys` 命令

1. 在消息输入框输入 `/hotkeys`。
2. 弹出菜单列出所有动作及当前键。
3. 选「🎙 录制「xxx」键」→ 按下组合键。

### 组合键语法

- 格式：修饰键 + 主键，用 `+` 连接，如 `Control+Shift+Enter`。
- 修饰键别名（任选一种写法）：

| 修饰键 | 别名 |
|---|---|
| Ctrl | `Ctrl` / `Control` / `⌃` |
| Meta | `Meta` / `Cmd` / `Command` / `Win` / `⌘` |
| Shift | `Shift` / `⇧` |
| Alt | `Alt` / `Option` / `⌥` |

- 单字符主键自动大写；空格键写作 `Space`。

### 键位三态

| 状态 | 含义 |
|---|---|
| 未改过 | 使用动作声明的默认键（`defaultKey`） |
| 已录制 | 使用你设置的键 |
| 已禁用 | 完全不触发 |

### 冲突说明

当多个动作绑定了**同一个组合键**，先注册的动作优先触发；冲突的动作在设置页会**红色高亮**，请改绑其中一个避免歧义。

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
