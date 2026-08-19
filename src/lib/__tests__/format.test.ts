import { describe, expect, it } from 'vitest';

import { EMPTY, formatDaysLeft, formatHours, formatPercent } from '@/lib/format';

/**
 * Quy ước xuyên suốt: **chưa có dữ liệu ≠ 0** (nguyên tắc số liệu 2).
 */
describe('formatDaysLeft', () => {
  // Nhận đầu vào theo `deadlineDaysAway`: hôm nay = 0. Trước đây màn hình “Việc của tôi” truyền
  // `businessDaysLeft` (tính cả hôm nay) nên việc đến hạn hôm nay lại hiện “Còn 1 ngày”, mâu thuẫn
  // với chính tiêu đề nhóm nó đang nằm trong.
  it('hôm nay là đến hạn, không phải còn một ngày', () => {
    expect(formatDaysLeft(0)).toBe('Đến hạn hôm nay');
  });

  it('đếm ngày làm việc còn lại và số ngày đã quá hạn', () => {
    expect(formatDaysLeft(1)).toBe('Còn 1 ngày');
    expect(formatDaysLeft(7)).toBe('Còn 7 ngày');
    expect(formatDaysLeft(-3)).toBe('Quá hạn 3 ngày');
  });

  it('không có hạn thì để trống, không quy về 0', () => {
    expect(formatDaysLeft(null)).toBe(EMPTY);
    expect(formatDaysLeft(undefined)).toBe(EMPTY);
  });
});

describe('số liệu thiếu không được hiển thị thành 0', () => {
  it('phần trăm và giờ đều trả dấu gạch khi chưa có dữ liệu', () => {
    expect(formatPercent(null)).toBe(EMPTY);
    expect(formatHours(null)).toBe(EMPTY);
    expect(formatPercent(0)).toBe('0%');
    expect(formatHours(0)).toBe('0h');
  });
});
