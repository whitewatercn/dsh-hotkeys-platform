import { describe, it, expect } from 'vitest'
import { loadStorage, serializeStorage, migrateLegacy, effectiveKey, isDisabled, normalizeBindings } from '../src/store'

describe('loadStorage / serializeStorage', () => {
  it('空 → 空结构', () => {
    expect(loadStorage(null)).toEqual({ version: 1, bindings: {} })
  })
  it('损坏 JSON → 空结构', () => {
    expect(loadStorage('{oops')).toEqual({ version: 1, bindings: {} })
  })
  it('正常解析', () => {
    expect(loadStorage('{"version":1,"bindings":{"a":"Ctrl+K"}}').bindings).toEqual({ a: 'Ctrl+K' })
  })
  it('round-trip', () => {
    const s = { version: 1 as const, bindings: { a: 'Ctrl+K', b: '' } }
    expect(loadStorage(serializeStorage(s))).toEqual(s)
  })
})

describe('normalizeBindings', () => {
  it('丢弃非字符串值', () => {
    expect(normalizeBindings({ a: 'x', b: 1 as unknown as string })).toEqual({ a: 'x' })
  })
})

describe('migrateLegacy', () => {
  it('无旧数据 → 空', () => {
    expect(migrateLegacy(null)).toEqual({})
  })
  it('只迁非默认绑定', () => {
    const legacy = JSON.stringify({ bindings: { send: 'Control+Enter', newline: 'Enter', customAnswerSubmit: 'F9' } })
    expect(migrateLegacy(legacy)).toEqual({ 'dsh-hotkeys:newline': 'Enter', 'dsh-hotkeys:customAnswerSubmit': 'F9' })
  })
  it('全默认 → 空', () => {
    const legacy = JSON.stringify({ bindings: { send: 'Control+Enter', newline: '', customAnswerSubmit: 'Enter' } })
    expect(migrateLegacy(legacy)).toEqual({})
  })
})

describe('effectiveKey / isDisabled', () => {
  it('未改 → 回落 defaultKey', () => {
    expect(effectiveKey({}, 'a', 'Ctrl+K')).toBe('Ctrl+K')
  })
  it('用户绑定优先', () => {
    expect(effectiveKey({ a: 'F9' }, 'a', 'Ctrl+K')).toBe('F9')
  })
  it('空串 → 显式禁用（null）', () => {
    expect(effectiveKey({ a: '' }, 'a', 'Ctrl+K')).toBeNull()
  })
  it('无默认 → null', () => {
    expect(effectiveKey({}, 'a', undefined)).toBeNull()
  })
  it('isDisabled 只认空串', () => {
    expect(isDisabled({ a: '' }, 'a')).toBe(true)
    expect(isDisabled({}, 'a')).toBe(false)
    expect(isDisabled({ a: 'F9' }, 'a')).toBe(false)
  })
})
