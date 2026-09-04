import { describe, it, expect } from 'vitest';

import { extractJsonFromLlmContent } from '../../src/lib/llm';

describe('extractJsonFromLlmContent', () => {
  it('纯 JSON → 原样', () => {
    expect(extractJsonFromLlmContent('{"ok":1}')).toBe('{"ok":1}');
  });

  it('```json 围栏 → 提取', () => {
    const input = '```json\n{"ok":1}\n```';
    expect(extractJsonFromLlmContent(input)).toBe('{"ok":1}');
  });

  it('M2.7 thinking 段 → 提取', () => {
    // 与 docs/m2-7-fix-memo.md 实测一致：thinking...\n\nresponse\n\n{JSON}
    const input = 'thinking abc\n\nresponse\n\n{"ok":1}';
    expect(extractJsonFromLlmContent(input)).toBe('{"ok":1}');
  });

  it('前后多余文字 → 取 {} 兜底', () => {
    const input = 'Here is the result:\n{"ok":1}\nThanks';
    expect(extractJsonFromLlmContent(input)).toBe('{"ok":1}');
  });

  it('thinking + ```json 围栏组合', () => {
    const input = 'thinking reason\n\nresponse\n\n```json\n{"a":2}\n```';
    expect(extractJsonFromLlmContent(input)).toBe('{"a":2}');
  });
});
