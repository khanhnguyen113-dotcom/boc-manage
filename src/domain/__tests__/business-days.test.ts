import { describe, expect, it } from 'vitest';

import {
  addBusinessDays,
  businessDaysLeft,
  countBusinessDays,
  createCalendar,
  deadlineDaysAway,
  formatDate,
  MASK_MON_FRI,
  MASK_MON_SAT,
  monthRange,
  weekRange,
  yearRange,
} from '@/domain/business-days';

/** Ngày nghỉ 2026 lấy từ tab “Ngày nghỉ lễ” của Sheet nguồn. */
const HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-04-27',
  '2026-04-30',
  '2026-05-01',
  '2026-09-01',
  '2026-09-02',
];

const monSat = createCalendar(MASK_MON_SAT, HOLIDAYS_2026);
const monFri = createCalendar(MASK_MON_FRI, HOLIDAYS_2026);

describe('đối chiếu với ô KIỂM TRA CÔNG THỨC NGÀY LÀM VIỆC của Sheet', () => {
  // Sheet: “Có thứ Bảy + Chủ nhật · 8/1/2026 → 8/3/2026 · Kết quả 2”
  it('01/08/2026 (Bảy) → 03/08/2026 (Hai) = 2 ngày, loại Chủ nhật', () => {
    expect(countBusinessDays('2026-08-01', '2026-08-03', monSat)).toBe(2);
  });

  // Sheet: “Hai ngày đều là ngày nghỉ lễ · 4/30/2026 → 5/1/2026 · Kết quả 0”
  it('30/04/2026 → 01/05/2026 = 0 vì cả hai đều là ngày nghỉ lễ', () => {
    expect(countBusinessDays('2026-04-30', '2026-05-01', monSat)).toBe(0);
  });

  it('lịch 5 ngày cho kết quả khác — đúng như mâu thuẫn đã ghi ở NEED_CONFIRMATION B2', () => {
    expect(countBusinessDays('2026-08-01', '2026-08-03', monFri)).toBe(1);
  });
});

describe('countBusinessDays', () => {
  it('tính bao gồm cả hai đầu, giống NETWORKDAYS.INTL', () => {
    // 03/08 Hai → 08/08 Bảy = 6 ngày làm việc (không có lễ trong khoảng).
    expect(countBusinessDays('2026-08-03', '2026-08-08', monSat)).toBe(6);
  });

  it('trả 0 khi hạn kết thúc trước ngày bắt đầu', () => {
    expect(countBusinessDays('2026-08-10', '2026-08-03', monSat)).toBe(0);
  });

  it('trừ đúng số ngày nghỉ Tết', () => {
    // 16/02 → 20/02 đều là nghỉ Tết.
    expect(countBusinessDays('2026-02-16', '2026-02-20', monSat)).toBe(0);
  });
});

describe('businessDaysLeft', () => {
  it('dương khi còn hạn, tính cả ngày kết thúc', () => {
    expect(businessDaysLeft('2026-08-03', '2026-08-08', monSat)).toBe(6);
  });

  it('bằng 1 khi hạn là chính hôm nay và hôm nay là ngày làm việc', () => {
    expect(businessDaysLeft('2026-08-03', '2026-08-03', monSat)).toBe(1);
  });

  it('bằng 0 khi hạn rơi đúng ngày nghỉ', () => {
    expect(businessDaysLeft('2026-09-02', '2026-09-02', monSat)).toBe(0);
  });

  it('âm khi đã quá hạn', () => {
    // Hạn 03/08 (Hai), hôm nay 08/08 (Bảy): 04,05,06,07,08 = 5 ngày làm việc đã trôi qua.
    expect(businessDaysLeft('2026-08-08', '2026-08-03', monSat)).toBe(-5);
  });

  it('trả null khi không có hạn', () => {
    expect(businessDaysLeft('2026-08-08', null, monSat)).toBeNull();
  });
});

describe('deadlineDaysAway', () => {
  it('coi đúng ngày đến hạn là 0 và ngày làm việc kế tiếp là 1', () => {
    expect(deadlineDaysAway('2026-08-12', '2026-08-12', monSat)).toBe(0);
    expect(deadlineDaysAway('2026-08-12', '2026-08-13', monSat)).toBe(1);
  });

  it('không tính ngày hiện tại vào ngưỡng cảnh báo', () => {
    expect(deadlineDaysAway('2026-08-12', '2026-08-14', monSat)).toBe(2);
  });
});

describe('addBusinessDays', () => {
  it('nhảy qua Chủ nhật', () => {
    expect(addBusinessDays('2026-08-01', 1, monSat)).toBe('2026-08-03');
  });

  it('nhảy qua cả cụm nghỉ Tết', () => {
    expect(addBusinessDays('2026-02-14', 1, monSat)).toBe('2026-02-21');
  });
});

describe('kỳ báo cáo', () => {
  it('tuần bắt đầu Thứ Hai', () => {
    // 12/08/2026 là Thứ Tư.
    expect(weekRange('2026-08-12')).toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('tuần chứa Chủ nhật quy về Thứ Hai trước đó', () => {
    expect(weekRange('2026-08-16').start).toBe('2026-08-10');
  });

  it('tháng và năm', () => {
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(yearRange(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });
});

describe('định dạng hiển thị', () => {
  it('dd/MM/yyyy theo guideline 13.7', () => {
    expect(formatDate('2026-08-12')).toBe('12/08/2026');
  });

  it('giá trị rỗng hiển thị em dash, không hiển thị Invalid Date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('rác')).toBe('—');
  });
});
