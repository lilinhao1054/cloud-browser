import type { KeyModifiers } from '../types';

// 虚拟按键码映射表
const KEY_CODE_MAP: Record<string, number> = {
  'Backspace': 8,
  'Tab': 9,
  'Enter': 13,
  'Shift': 16,
  'Control': 17,
  'Alt': 18,
  'Escape': 27,
  'Space': 32,
  'ArrowLeft': 37,
  'ArrowUp': 38,
  'ArrowRight': 39,
  'ArrowDown': 40,
  'Delete': 46,
  'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115,
  'F5': 116, 'F6': 117, 'F7': 118, 'F8': 119,
  'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123,
};

/**
 * 获取修饰键标志
 */
export function getModifierFlags(modifiers: KeyModifiers): number {
  let flags = 0;
  if (modifiers.alt) flags |= 1;
  if (modifiers.ctrl) flags |= 2;
  if (modifiers.meta) flags |= 4;
  if (modifiers.shift) flags |= 8;
  return flags;
}

/**
 * 获取虚拟按键码
 */
export function getKeyCode(key: string, code: string): number {
  if (KEY_CODE_MAP[key]) {
    return KEY_CODE_MAP[key];
  }

  // 字母键 A-Z
  if (key.length === 1 && key >= 'a' && key <= 'z') {
    return key.toUpperCase().charCodeAt(0);
  }
  if (key.length === 1 && key >= 'A' && key <= 'Z') {
    return key.charCodeAt(0);
  }

  // 数字键 0-9
  if (key.length === 1 && key >= '0' && key <= '9') {
    return key.charCodeAt(0);
  }

  // 其他字符
  if (key.length === 1) {
    return key.charCodeAt(0);
  }

  return 0;
}
