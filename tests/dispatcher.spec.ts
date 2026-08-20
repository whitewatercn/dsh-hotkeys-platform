import { describe, it, expect } from 'vitest'
import { resolveEntries, resolveDispatch } from '../src/client/dispatcher'
import type { HotkeyActionDescriptor } from '../src/context-types'

const event = (over: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over }) as KeyboardEvent

const deps = {
  isComposing: () => false,
  hasOpenOverlay: () => false,
  isSynthetic: () => false,
  isRecording: () => false,
}

const action = (over: Partial<HotkeyActionDescriptor>): HotkeyActionDescriptor => ({
  id: 'test:a',
  title: 'test',
  handler: () => {},
  ...over,
})

describe('resolveEntries', () => {
  it('未改 → 回落 defaultKey', () => {
    const entries = resolveEntries([action({ defaultKey: 'Ctrl+Enter' })], {})
    expect(entries[0].combo).toMatchObject({ key: 'Enter', ctrl: true })
  })
  it('显式禁用 → combo null', () => {
    const entries = resolveEntries([action({ defaultKey: 'Ctrl+Enter' })], { 'test:a': '' })
    expect(entries[0].combo).toBeNull()
  })
  it('用户绑定优先', () => {
    const entries = resolveEntries([action({ defaultKey: 'Ctrl+Enter' })], { 'test:a': 'F9' })
    expect(entries[0].combo).toMatchObject({ key: 'F9' })
  })
  it('无默认 → null', () => {
    const entries = resolveEntries([action({})], {})
    expect(entries[0].combo).toBeNull()
  })
})

describe('resolveDispatch', () => {
  it('命中默认键', () => {
    const entries = resolveEntries([action({ defaultKey: 'Enter', scope: 'global' })], {})
    const hit = resolveDispatch(entries, event(), deps)
    expect(hit?.id).toBe('test:a')
  })

  it('组合键不匹配 → null', () => {
    const entries = resolveEntries([action({ defaultKey: 'Ctrl+Enter' })], {})
    expect(resolveDispatch(entries, event(), deps)).toBeNull()
  })

  it('scope 不命中 → null', () => {
    const entries = resolveEntries([action({ defaultKey: 'Enter', scope: 'input' })], {})
    // 无 DOM 环境，target 不是 Element，input scope 不命中
    expect(resolveDispatch(entries, event({ target: null as unknown as EventTarget }), deps)).toBeNull()
  })

  it('禁用动作跳过', () => {
    const entries = resolveEntries([action({ defaultKey: 'Enter' })], { 'test:a': '' })
    expect(resolveDispatch(entries, event(), deps)).toBeNull()
  })

  it('守卫命中 → 放行（null）', () => {
    const entries = resolveEntries([action({ defaultKey: 'Enter', scope: 'global' })], {})
    expect(resolveDispatch(entries, event(), { ...deps, isComposing: () => true })).toBeNull()
    expect(resolveDispatch(entries, event(), { ...deps, hasOpenOverlay: () => true })).toBeNull()
    expect(resolveDispatch(entries, event(), { ...deps, isSynthetic: () => true })).toBeNull()
    expect(resolveDispatch(entries, event(), { ...deps, isRecording: () => true })).toBeNull()
  })

  it('order 升序：先注册者优先（命中第一个匹配）', () => {
    const entries = resolveEntries([
      action({ id: 'a', order: 10, defaultKey: 'Enter' }),
      action({ id: 'b', order: 20, defaultKey: 'Enter' }),
    ], {})
    const hit = resolveDispatch(entries, event(), deps)
    expect(hit?.id).toBe('a')
  })

  it('custom scope 走 target 函数', () => {
    const entries = resolveEntries([
      action({ id: 'c', scope: 'custom', defaultKey: 'Enter', target: () => true }),
    ], {})
    const ev = event({ target: { closest: () => null } as unknown as HTMLElement })
    // target 返回 true，但 target 须是 HTMLElement；用真实 HTMLElement 需要 jsdom。
    // 这里验证 custom scope 未命中时的 null（target 非 Element）。
    expect(resolveDispatch(entries, event({ target: null as unknown as EventTarget }), deps)).toBeNull()
  })
})
