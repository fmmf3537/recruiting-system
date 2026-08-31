import { describe, it, expect } from 'vitest';
import { getVisibleInterviewIds } from '../../src/routes/interview';

describe('getVisibleInterviewIds', () => {
  it('userId 在 interviewers JSON 中 → 返回该 interview id', () => {
    expect(
      getVisibleInterviewIds(
        [{ id: 'int-1', interviewers: [{ id: 'user-1', name: '甲' }] }],
        'user-1'
      )
    ).toEqual(['int-1']);
  });

  it('userId 不在 → 不返回', () => {
    expect(
      getVisibleInterviewIds(
        [{ id: 'int-1', interviewers: [{ id: 'user-2', name: '乙' }] }],
        'user-1'
      )
    ).toEqual([]);
  });

  it('interviewers 字段为 null → 不返回', () => {
    expect(getVisibleInterviewIds([{ id: 'int-1', interviewers: null }], 'user-1')).toEqual([]);
  });

  it('interviewers 字段为 [] → 不返回', () => {
    expect(getVisibleInterviewIds([{ id: 'int-1', interviewers: [] }], 'user-1')).toEqual([]);
  });

  it('多面试 + 多面试官 → 只返回匹配的', () => {
    const ids = getVisibleInterviewIds(
      [
        { id: 'int-a', interviewers: [{ id: 'user-1' }, { id: 'user-2' }] },
        { id: 'int-b', interviewers: [{ id: 'user-2' }] },
        { id: 'int-c', interviewers: [{ id: 'user-1' }] },
      ],
      'user-1'
    );
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining(['int-a', 'int-c']));
  });
});
