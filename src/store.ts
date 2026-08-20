/**
 * 绑定持久化（localStorage）+ 生效键解析 + 旧配置迁移（纯函数，可测）。
 *
 * 持久化结构（key: 'dsh.hotkeys.v1'）：
 *   { version: 1, bindings: { [actionId]: combo } }
 * 只存用户显式改过的；未出现 = 回落 defaultKey。
 *
 * 三态语义（combo 字符串）：
 *   - 未出现在 bindings → 回落 defaultKey；
 *   - 具体串（如 'Control+Enter'）→ 用户绑定；
 *   - ''（空串）→ 显式禁用（连默认键也关掉）。
 */

export const STORAGE_KEY = 'dsh.hotkeys.v1'
/** 旧 dsh-hotkeys 的 localStorage 键（迁移源，保留不删）。 */
export const LEGACY_STORAGE_KEY = 'dsh.sendkeys.v1'

export interface HotkeysStorageV1 {
  version: 1
  bindings: Record<string, string>
}

/** 旧 dsh-hotkeys 三动作的默认绑定（迁移时用于「只迁非默认」的判定）。 */
const LEGACY_DEFAULTS: Record<string, string> = {
  send: 'Control+Enter',
  newline: '',
  customAnswerSubmit: 'Enter',
}

/** 旧 actionId → 平台 actionId 的映射（dsh-hotkeys 消费插件沿用旧 id 前缀）。 */
const LEGACY_ID_MAP: Record<string, string> = {
  send: 'dsh-hotkeys:send',
  newline: 'dsh-hotkeys:newline',
  customAnswerSubmit: 'dsh-hotkeys:customAnswerSubmit',
}

/** 规范化 bindings：只保留 actionId -> 非空串的条目（空串仍要保留以表「显式禁用」）。 */
export function normalizeBindings(bindings: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!bindings) return out
  for (const [id, combo] of Object.entries(bindings)) {
    if (typeof combo === 'string') out[id] = combo
  }
  return out
}

/** 从原始字符串读取当前存储；损坏/不存在返回空结构。 */
export function loadStorage(raw: string | null): HotkeysStorageV1 {
  if (!raw) return { version: 1, bindings: {} }
  try {
    const parsed = JSON.parse(raw)
    const bindings = normalizeBindings(parsed?.bindings)
    return { version: 1, bindings }
  } catch {
    return { version: 1, bindings: {} }
  }
}

export function serializeStorage(storage: HotkeysStorageV1): string {
  return JSON.stringify(storage)
}

/**
 * 迁移旧 dsh-hotkeys 配置（dsh.sendkeys.v1 → dsh.hotkeys.v1）。
 * 只迁「非默认」绑定（send/newline/customAnswerSubmit 中与默认不同的），
 * 返回应写入新键的 bindings；无旧数据或无差异返回空对象。
 */
export function migrateLegacy(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    const old = parsed?.bindings ?? {}
    const migrated: Record<string, string> = {}
    for (const [oldId, newId] of Object.entries(LEGACY_ID_MAP)) {
      const value = old[oldId]
      if (typeof value !== 'string') continue
      if (value === (LEGACY_DEFAULTS[oldId] ?? null)) continue // 与默认相同，不迁
      migrated[newId] = value
    }
    return migrated
  } catch {
    return {}
  }
}

/**
 * 一个动作当前生效的键：
 *   - bindings[id] 存在且为空串 → null（显式禁用）；
 *   - bindings[id] 存在且非空 → 该串；
 *   - 否则 → defaultKey（可能为空，表示「默认不绑」）。
 */
export function effectiveKey(
  bindings: Record<string, string>,
  actionId: string,
  defaultKey: string | undefined,
): string | null {
  const bound = bindings[actionId]
  if (bound !== undefined) {
    return bound === '' ? null : bound
  }
  return defaultKey ?? null
}

/** 一个动作是否被显式禁用。 */
export function isDisabled(bindings: Record<string, string>, actionId: string): boolean {
  return bindings[actionId] === ''
}
