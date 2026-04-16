import { describe, it, expect } from 'vitest';

describe('ListPage pagination logic', () => {
  it('should calculate finished when data length less than pageSize', () => {
    const pageSize = 10;
    const dataLength = 5;
    const totalPages = 3;
    const page = 1;
    const finished = page >= totalPages || dataLength < pageSize;
    expect(finished).toBe(true);
  });

  it('should calculate finished when page reaches totalPages', () => {
    const pageSize = 10;
    const dataLength = 10;
    const totalPages = 2;
    const page = 2;
    const finished = page >= totalPages || dataLength < pageSize;
    expect(finished).toBe(true);
  });

  it('should not finished when more pages exist', () => {
    const pageSize = 10;
    const dataLength = 10;
    const totalPages = 3;
    const page = 1;
    const finished = page >= totalPages || dataLength < pageSize;
    expect(finished).toBe(false);
  });
});

describe('Offer result tag type', () => {
  function getResultType(result: string) {
    if (result === 'accepted') return 'success';
    if (result === 'rejected') return 'danger';
    return 'warning';
  }

  it('should return success for accepted', () => {
    expect(getResultType('accepted')).toBe('success');
  });

  it('should return danger for rejected', () => {
    expect(getResultType('rejected')).toBe('danger');
  });

  it('should return warning for pending', () => {
    expect(getResultType('pending')).toBe('warning');
  });
});
