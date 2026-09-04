/**
 * 从 LLM 输出中提取合法 JSON 字符串。
 * 兼容推理模型（MiniMax M2.7 等）的 thinking...response 前缀输出；
 * 兼容 ```json 围栏、首尾空白、前后多余文字。
 *
 * 放在 utils（非 lib/llm）：既有 vitest 对 lib/llm 整模块 mock 时不会丢失本纯函数。
 * lib/llm.ts 再导出同名符号，符合 LLM-FIX 对外 API。
 */
export function extractJsonFromLlmContent(content: string): string {
  let s = content.trim();
  // 1) 推理模型：取 response 标记之后的正文（M2.7 输出 thinking...\n\nresponse\n\n{JSON}）
  const respIdx = s.search(/\bresponse\b\n/);
  if (respIdx !== -1) {
    s = s.slice(respIdx + 'response\n'.length);
  }
  // 2) ```json 围栏
  if (s.startsWith('```json')) s = s.slice(7);
  else if (s.startsWith('```')) s = s.slice(3);
  if (s.endsWith('```')) s = s.slice(0, -3);
  // 3) 兜底：取第一个 { 到最后一个 }（防前后多余文字）
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}
