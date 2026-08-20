import { describe, it, expect } from 'vitest'
import { parseCombo, describeCombo, matchCombo, isEmptyCombo, isPlainEnter, isEnterFamily } from '../src/combo'

describe('parseCombo', () => {
  it('解析修饰键 + 主键', () => {
    expect(parseCombo('Control+Shift+Enter')).toEqual({ key: 'Enter', ctrl: true, meta: false, shift: true, alt: false })
  })

  it('支持别名（cmd/⌘/⌥/⇧/⌃）', () => {
    expect(parseCombo('Cmd+Enter')).toMatchObject({ key: 'Enter', meta: true })
    expect(parseCombo('⌘+Enter')).toMatchObject({ key: 'Enter', meta: true })
    expect(parseCombo('⌥+⌃+K')).toMatchObject({ key: 'K', alt: true, ctrl: true })
  })

  it('空串 → 空组合键', () => {
    expect(parseCombo('')).toEqual({ key: '', ctrl: false, meta: false, shift: false, alt: false })
  })

  it('最后一个非修饰 token 作为主键', () => {
    expect(parseCombo('A+B')).toMatchObject({ key: 'B' })
  })
})

describe('describeCombo', () => {
  it('组合键 → 字符串', () => {
    expect(describeCombo({ key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe('Ctrl+Enter')
  })

  it('纯修饰键返回 null', () => {
    expect(describeCombo({ key: 'Control', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBeNull()
  })

  it('单字符转大写，空格 → Space', () => {
    expect(describeCombo({ key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe('K')
    expect(describeCombo({ key: ' ', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe('Space')
  })
})

describe('matchCombo', () => {
  const event = { key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }
  it('命中', () => {
    expect(matchCombo(event, parseCombo('Ctrl+Enter'))).toBe(true)
  })
  it('修饰键不匹配则 miss', () => {
    expect(matchCombo(event, parseCombo('Shift+Enter'))).toBe(false)
  })
  it('主键大小写不敏感', () => {
    expect(matchCombo({ ...event, key: 'enter' }, parseCombo('Ctrl+Enter'))).toBe(true)
  })
  it('空组合键永不命中', () => {
    expect(matchCombo(event, parseCombo(''))).toBe(false)
  })
})

describe('语义谓词', () => {
  it('isEmptyCombo', () => {
    expect(isEmptyCombo(parseCombo(''))).toBe(true)
    expect(isEmptyCombo(parseCombo('Enter'))).toBe(false)
  })
  it('isPlainEnter', () => {
    expect(isPlainEnter(parseCombo('Enter'))).toBe(true)
    expect(isPlainEnter(parseCombo('Ctrl+Enter'))).toBe(false)
  })
  it('isEnterFamily', () => {
    expect(isEnterFamily(parseCombo('Enter'))).toBe(true)
    expect(isEnterFamily(parseCombo('Ctrl+Enter'))).toBe(true)
    expect(isEnterFamily(parseCombo('F9'))).toBe(false)
  })
})
