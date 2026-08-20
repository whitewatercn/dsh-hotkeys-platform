# dsh-hotkeys-platform 设计文档

> **快捷键设定平台**：把硬编码的 `dsh-hotkeys`（send/newline/customAnswerSubmit 三动作）升级为**注册表服务** `ctx.hotkeys`。
> 任何插件可注册「动作 → 处理器」，动作的默认键、触发范围、描述由插件声明；用户的**显式改键**统一在平台持久化；设置页 + `/hotkeys` 命令提供统一配置。
>
> 架构范式与 [`DSH-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 完全同构：宿主插件 `ctx.provide('hotkeys', service)`，内置动作自己通过同一套 API 注册（吃狗粮），外部插件能力对等。
>
> - 状态：**设计（未实现）**
> - 目标包：`dsh-hotkeys-platform`（当前为空仓库）
> - 消费插件：`dsh-hotkeys`（现有三动作拆成首个吃狗粮消费者）
> - 适用版本基线：基于 `dsh-hotkeys@0.1.1` 的现有实现

---

## 0. 决策记录（已与用户确认）

| 决策项 | 结论 |
|---|---|
| 包的形式 | **新建独立平台包 `dsh-hotkeys-platform`**；现有 `dsh-hotkeys` 三动作拆成首个消费插件 |
| Host 侧 | **client 为主，host 仅可选设置命名空间**（选项①）；需 host 能力的动作由各插件自带路由 |
| 作用域模型 | **内置常用 scope + 插件可传自定义 `target` 函数** |
| 设置 UI | **DSH 设置页新增分区 + 保留 `/hotkeys` 命令** |
| 持久化 | `{ [actionId]: combo }` 覆盖表，只存用户显式改过的；回落 `defaultKey`；迁移旧键 `dsh.sendkeys.v1` |
| 向后兼容 | `dsh-hotkeys` 的 `window.__dshHotkeys` API 与 `/hotkeys` 命令保留（薄代理到平台） |
| 内置动作归属 | **由 `dsh-hotkeys` 消费插件注册**，平台保持纯净（只做注册表 + 分发 + UI） |

---

## 1. 平台定位（两个平面）

- **client half（主体）**：`ctx.provide('hotkeys', service)`，全局 keydown 分发、注册表、录制、设置页、命令。
- **host half（可选扩展）**：仅预留一个 `hotkeys` 设置命名空间（存需要 host 侧参与的配置），其余留空。需要 host 能力的动作（如归档会话、执行命令、读写文件）由各插件自带 host 路由——平台不关心。

> 键盘事件、录制、设置 UI 都只在浏览器存在，因此**平台主体必然在 client**。host 侧不承载任何键盘分发逻辑。

---

## 2. 服务 API（client half）

```ts
interface HotkeyService {
  /** 注册一个快捷键动作；返回 disposer（HMR-safe，卸载自动撤销） */
  registerAction(descriptor: HotkeyActionDescriptor): () => void

  /** 当前已注册的动作快照（含被设置页禁用的；按 order 升序） */
  getActions(): readonly HotkeyActionDescriptor[]

  /** 用户显式改过的绑定表：actionId -> combo（不含未改的，未改回落 defaultKey） */
  getBindings(): Readonly<Record<string, string>>

  /** 一个动作当前生效的键（用户绑定 ?? 默认键 ?? null） */
  effectiveKey(actionId: string): string | null

  /** 设置/清除一个动作的用户绑定；combo='' 表示清除（回落默认） */
  setBinding(actionId: string, combo: string): void

  /** 进入录制态，捕获下一个组合键并返回描述串（Esc/超时返回 null） */
  record(actionId: string): Promise<string | null>

  /** 订阅注册表/绑定变化；返回 disposer */
  subscribe(listener: () => void): () => void

  /** 单调能力清单（只增不删），消费插件用 features.includes('xxx') gate */
  readonly features: readonly string[]
  readonly version: string
}
```

### 动作描述符

```ts
type HotkeyScope =
  | 'global'          // 任意处（默认）
  | 'input'           // 可编辑文本区（textarea/input[type=text]）
  | 'question-card'   // DeepSeek 提问卡内（[data-question-key] 内）
  | 'command-palette' // 命令菜单/下拉打开时
  | 'custom'          // 需要自定义 target 判定

interface HotkeyActionDescriptor {
  /** 唯一 id；建议包前缀 'my-plugin:send-message' */
  id: string
  /** 标题（i18n 友好：字符串或返回字符串的函数） */
  title: string | (() => string)
  /** 描述，显示在设置页 */
  description?: string
  /** 动作分组（设置页分区展示） */
  group?: string
  /** 默认组合键，如 'Control+Enter'；用户未改时生效 */
  defaultKey?: string
  /** 触发范围 */
  scope?: HotkeyScope
  /** scope='custom' 时的精确判定；target 命中才触发 */
  target?: (el: HTMLElement) => boolean
  /**
   * 命中后的处理。
   * ctx 提供当前事件目标、合成 Enter 工具、当前绑定等。
   * 返回 false 表示「不消费，放行给后续动作/DSH 原生行为」。
   */
  handler(event: KeyboardEvent, ctx: HotkeyActionContext): void | boolean
  /** 设置页是否显示该动作（默认 true） */
  hidden?: boolean
  /** 排序 */
  order?: number
  /** 版本/能力 gate：老版本未定义时用 features 探测 */
}

interface HotkeyActionContext {
  target: HTMLElement | null
  /** 合成一次裸 Enter（触发 DSH 原生发送等），自动防重入 */
  dispatchEnter(el: HTMLElement): void
  /** 在光标处插入文本并触发 input（React 受控组件友好） */
  insertTextAtCaret(el: HTMLTextAreaElement, text: string): void
  /** 是否有打开的 overlay（命令菜单/下拉/对话框） */
  hasOpenOverlay(): boolean
  /** 事件目标是否为可编辑文本区 */
  isEditableTarget(el: Element | null): boolean
}
```

> `registerAction` 返回 disposer，必须由消费插件包在 `ctx.effect(...)` 里（HMR-safe，同 better-sidebar 约定）。

---

## 3. 内置 scope 判定（平台提供，消费插件可复用）

| scope | 判定 |
|---|---|
| `global` | 恒真 |
| `input` | `target instanceof HTMLTextAreaElement` 或 `target instanceof HTMLInputElement` |
| `question-card` | `target.closest('input[type=text], textarea')` 且其内 `closest('[data-question-key]')` 命中 |
| `command-palette` | `hasOpenOverlay()` 命中（`[role=menu]/[role=listbox]/[role=dialog]/[role=combobox][aria-expanded=true]` 可见） |
| `custom` | 调 `descriptor.target(el)` |

平台**只做 scope 命中判定 + 组合键匹配**，命中后把事件交给 `handler`；守卫（IME/overlay/editable）作为通用基础在分发器里统一执行（见 §5）。

---

## 4. 数据模型与持久化

### 4.1 持久化结构（localStorage）

```ts
// key: 'dsh.hotkeys.v1'
interface HotkeysStorageV1 {
  version: 1
  /** 只存用户显式改过的；未出现 = 回落 defaultKey */
  bindings: Record<string, string>
}
```

- **只存用户显式改过的**——与 better-sidebar 的 `pluginSettings[id]` 同一思路：插件升级改默认键，未改过键的用户自动跟随，已改过的不被覆盖。
- 组合键串格式沿用现有 `dsh-hotkeys`：`'Control+Shift+Enter'`，修饰键别名 `ctrl/meta/shift/alt` 及 `⌃/⌘/⇧/⌥`。

### 4.2 迁移旧配置（dsh-hotkeys → 平台）

- 旧键 `dsh.sendkeys.v1` 存 `{ bindings: { send, newline, customAnswerSubmit } }`。
- 迁移规则：平台首次启动时，若 `dsh.hotkeys.v1` 不存在而 `dsh.sendkeys.v1` 存在，则把旧三动作的**非默认绑定**写入新键，并**保留**旧键（不删除，供回滚/旧插件读）。

### 4.3 内置动作注册（吃狗粮）

> **已决定：内置三动作由 `dsh-hotkeys` 消费插件注册，平台不内置任何业务动作。** 平台自带唯一的「吃狗粮」示例是可选的 demo action（可后续移除）。

`dsh-hotkeys` 消费插件通过平台注册三个动作，与现有行为完全一致：

```ts
ctx.hotkeys.registerAction({ id: 'dsh-hotkeys:send',   title: '发送',   scope: 'input', defaultKey: 'Control+Enter' })
ctx.hotkeys.registerAction({ id: 'dsh-hotkeys:newline', title: '换行',   scope: 'input', defaultKey: '' /* 留空=不拦截 */ })
ctx.hotkeys.registerAction({ id: 'dsh-hotkeys:customAnswerSubmit', title: '自定义答案提交', scope: 'question-card', defaultKey: 'Enter' })
```

它们的 handler 沿用现有 `handleKeyDown` 中 send/newline/customAnswer 的分支逻辑（合成 Enter、防泄漏、`isDshSendGesture` 放行、IME/overlay 守卫）。

---

## 5. 事件分发器（平台核心）

全局 `document.addEventListener('keydown', onKeyDown, { capture: true })`，单监听统一分发：

```
keydown(capture)
  ├─ 合成事件标记 __dshHotkeysSynthetic → 放行（防重入）
  ├─ 录制态 → 交给录制监听器
  ├─ 通用守卫：isComposing / hasOpenOverlay → 放行（不拦截）
  └─ 遍历注册动作（按 order 升序）：
       ├─ 组合键不匹配 → 下一动作
       ├─ scope 不命中 → 下一动作
       ├─ 调用 handler(event, ctx)
       │    └─ 返回 false → 不消费，继续下一动作
       └─ 返回 undefined/true → 已消费，stopImmediatePropagation
```

**关键原则**：
1. **守卫统一前置**：IME 合成、overlay 打开、editable 判定由平台分发器统一做，动作 handler 不再各自重复。但特定 scope（如 `question-card`）的细化守卫仍在 action 内。
2. **组合键匹配**复用现有 `parseCombo`/`matchCombo`/`describeCombo`/`MODIFIER_ALIASES`。
3. **「放行给 DSH 原生」是显式值**：handler 返回 `false` 表示不消费；平台对「裸 Enter 是 DSH 发送手势」等情形不再隐式放行，由动作显式决定。
4. **冲突检测**（设置页）：同一组合键被多个 action 使用时，分发按 order 先到先得，设置页高亮冲突并提示「谁先注册谁生效」。

---

## 6. 设置 UI

### 6.1 设置页分区（`settings.section`）

注册一个新分区，id `hotkeys`，label「快捷键」，order ≈ 150（在 skin-center 之后、community-plugins 之前）：

```ts
slots.inject('settings.section', () =>
  slots.register(
    { name: 'settings.section', id: 'hotkeys', label: () => t('快捷键'), order: 150 },
    ({ close }) => <HotkeysSettingsPanel />,
  )
)
```

面板内容（注册表驱动，无硬编码）：
- **动作列表**：按 `group` 分组 → 按 `order` 排序。每行显示 标题 / 描述 / 当前生效键 / 「录制」按钮。
- **录制交互**：点击录制 → 进入录制态（复用现有 `recordBinding` 的 toast + 15s 超时 + Esc 取消）→ 捕获组合键 → `setBinding`。
- **清除**：已改键的动作显示「清除」（回到 defaultKey）。
- **冲突高亮**：同一组合键被多个动作使用时，冲突行红色标记 + tooltip 说明谁先生效。
- **禁用开关**：每动作可整体禁用（persist 到 bindings 特殊值，或独立 enabled map——见 §7 未决项）。

### 6.2 `/hotkeys` 命令

沿用现有 `commandUi.register({ name: 'hotkeys', ... })`，改为**注册表驱动**：
- 列出所有注册动作（分组）；
- 每动作一行：当前键 + 「录制」入口；
- 保留「预设」（safe/default/im）——预设只作用于内置 send/newline，作为兼容层。

### 6.3 主题与样式

消费 DSH 的 `--dsw-alias-*` / `--dsw-font-*` / `--ds-*` 令牌，不硬编码颜色；CSS Modules 编译为哈希类名。

---

## 7. 待决项（实现前定）

1. **动作禁用语义**：**已决定**——`bindings[id] = ''` 表示「显式禁用」（连默认键也关掉）。三态：未出现（回落 `defaultKey`）/ 具体串（用户绑定）/ `''`（显式禁用）。`effectiveKey` 对 `''` 返回 `null` 且分发时跳过该动作。
2. **defaultKey='' 的语义**：现有 newline 用空串表示「不拦截」。平台是否保留？建议保留（空 = 默认不绑）。
3. **commandUi 服务的注入**：现有代码用 `ctx.get('commandUi')` 可选探测。需确认该服务的确切 key 与 `register` 签名（实现时用 Inspect 查证）。
4. **内置动作归属**：**已决定**——由 `dsh-hotkeys` 消费插件注册（平台纯净）。平台提供 `question-card` scope 与 `dispatchEnter` 等工具供其复用。
5. **聚合重复挂载守卫**：若未来有聚合包（如 `web-ui-all`）也挂载本平台，参照 better-sidebar 的 `disabled: !!js` 守卫（§见接入指南）。
6. **i18n**：平台字典 + `settings.section` 的 label 用 thunk（`() => t('快捷键')`），跟随 locale 实时切换。

---

## 8. 消费插件接入指南（dsh-hotkeys 作为首个案例）

`dsh-hotkeys` 从「自包含实现」改为「消费平台」：

```ts
export const inject = ['hotkeys']
export function apply(ctx: Context): void {
  ctx.effect(() =>
    ctx.hotkeys.registerAction({
      id: 'dsh-hotkeys:send',
      title: () => t('发送'),
      scope: 'input',
      defaultKey: 'Control+Enter',
      handler: (e, h) => { /* 现有 send 逻辑 */ },
    })
  )
  // newline / customAnswerSubmit 同理
}
```

- 迁移：旧 `window.__dshHotkeys` 变为对 `ctx.hotkeys` 的薄代理（保持控制台调试兼容）。
- 兼容：平台未安装时 `ctx.hotkeys` 为 undefined，注册代码安全跳过（`inject: ['hotkeys']` + peerDependency optional）。

---

## 9. 测试策略

- **纯函数单测**（vitest，不依赖运行时）：`parseCombo`/`matchCombo`/`describeCombo`、scope 判定、`effectiveKey` 回落逻辑、冲突检测、持久化序列化、旧配置迁移。
- **分发器单测**：伪造 `KeyboardEvent` + 一组注册动作，断言顺序/scope/守卫/消费传播（handler 返回 false 放行）。
- **挂载冒烟**（可选）：参照 better-sidebar 的 `plugin-mount`，打包后装入 scratch profile 无头渲染不 crash。

---

## 10. 目录结构（实现时目标）

```
dsh-hotkeys-platform/
├── dsh.plugin.json            # 注册表通道 manifest（id: dsh-external/dsh-hotkeys-platform）
├── cordis.patch.yml           # 挂载行
├── package.json               # dsh.bundle + peer(react, cordis, @deepseek-ai/dsh-client-*)
├── tsdown.config.ts           # host ESM + client.js(包名) + client-registry.js(manifest id)
├── src/
│   ├── index.ts               # host half（可选设置命名空间，其余留空）
│   ├── config.ts              # 设置 schema + 默认值
│   ├── combo.ts               # parseCombo/matchCombo/describeCombo（纯函数）
│   ├── scope.ts               # 内置 scope 判定（纯函数）
│   ├── store.ts               # bindings 持久化 + effectiveKey + 迁移（纯函数）
│   ├── context-types.ts       # HotkeyService 类型 + Context 增补
│   └── client/
│       ├── index.tsx          # apply：ctx.provide('hotkeys', service) + 分发器 + 命令
│       ├── dispatcher.ts      # 全局 keydown 分发
│       ├── record.ts          # 录制
│       ├── HotkeysSettingsPanel.tsx  # settings.section 设置页
│       └── locales.ts         # i18n
└── tests/
```
