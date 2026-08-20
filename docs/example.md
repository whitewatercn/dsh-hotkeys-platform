
## 实战教程：给插件注册快捷键（以 `dsh-better-archive` 为例）

下面用一个真实插件 [`dsh-better-archive`](https://github.com/huahai0202/dsh-better-archive)（在 DSH 设置区提供「已归档」会话管理页）做例子，逐步演示如何让它的功能接入快捷键平台。

### 目标

给 `dsh-better-archive` 增加一个全局快捷键 **`Control+Shift+A` → 打开「已归档」设置页**。用户可以在「设置 → 快捷键」里把它改绑成别的键，或整体禁用。

### 第 1 步：声明对平台的可选依赖

在 `dsh-better-archive/package.json` 里把平台加为 **peerDependency（可选）**，这样平台未安装时插件照常加载，注册代码因 `ctx.hotkeys` 为 undefined 而跳过：

```jsonc
{
  "peerDependencies": {
    "dsh-hotkeys-platform": "^0.1.0",
    "cordis": "^4.0.0-rc.8"
  },
  "peerDependenciesMeta": {
    "dsh-hotkeys-platform": { "optional": true }
  }
}
```

### 第 2 步：在 client half 里 `inject` 平台服务

```ts
export const inject = ['slots', 'sessions', 'hotkeys']  // 追加 'hotkeys'
```

> `inject` 里声明 `hotkeys` 后，Cordis 会**等平台发布 `ctx.hotkeys` 服务后才激活你的插件**；平台未安装时该服务永不出现，你的插件保持未激活（无 UI、无行为）。

### 第 3 步：注册动作

在你的 client `apply(ctx)` 里注册动作，**务必包在 `ctx.effect(...)`**（HMR/禁用时自动撤销）：

```ts
export function apply(ctx: Context): void {
  // ...你原有的 slots.inject('settings.section', ...) 注册归档页面...

  ctx.effect(() => {
    const hotkeys = ctx.get('hotkeys')   // 可选服务：未安装时 undefined
    if (!hotkeys) return

    hotkeys.registerAction({
      id: 'dsh-better-archive:open-archived',
      title: () => t('打开已归档'),          // i18n 友好
      description: '打开「已归档」设置页',
      group: '归档',
      scope: 'global',                       // 任意处触发
      defaultKey: 'Control+Shift+A',         // 默认键；用户可改绑
      handler: (event, h) => {
        // 打开 DSH 设置并导航到 better-archive 的「已归档」分区。
        // 具体打开方式取决于 DSH settings 服务是否暴露 openSection；
        // 接入时用 Inspect 查证该服务名后替换下面的占位调用。
        openSettings('better-archive')
      },
    })
  })
}
```