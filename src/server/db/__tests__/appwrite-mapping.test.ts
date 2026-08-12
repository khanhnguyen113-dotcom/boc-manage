import { describe, expect, it } from 'vitest';

import {
  BUSINESS_DATE_COLUMNS,
  businessDateToStorage,
  isBusinessDateColumn,
  isoToBusinessDate,
  mapFilterValue,
  mapRowFromStorage,
  mapRowToStorage,
  toStorageField,
} from '@/server/db/appwrite-mapping';

/**
 * Hai lỗi thật đã gặp khi đưa dữ liệu lên Appwrite — cả hai đều **hỏng âm thầm**, không ném lỗi,
 * chỉ làm con số trên dashboard sai:
 *
 * 1. Ngày trả về dạng ISO đầy đủ ⇒ `isOverdue` luôn false, KPI “Quá hạn” về 0 dù dữ liệu vẫn đúng.
 * 2. Sắp xếp theo `created_at` bị Appwrite từ chối vì đó là metadata `$createdAt`.
 */

const TZ = 'Asia/Ho_Chi_Minh';
const OFFSET = '+07:00';

describe('cột ngày nghiệp vụ suy từ schema', () => {
  it('nhận diện đúng các cột ngày của work_items', () => {
    const columns = BUSINESS_DATE_COLUMNS.work_items;
    expect(columns.has('planned_end')).toBe(true);
    expect(columns.has('display_end')).toBe(true);
    expect(columns.has('completed_at')).toBe(true);
    expect(columns.has('review_date')).toBe(true);
  });

  it('KHÔNG coi mốc thời gian là ngày nghiệp vụ', () => {
    // `archived_at` là thời điểm; quy đổi nó sẽ mất phần giờ.
    expect(BUSINESS_DATE_COLUMNS.work_items.has('archived_at')).toBe(false);
    expect(BUSINESS_DATE_COLUMNS.profiles.has('last_seen_at')).toBe(false);
    expect(BUSINESS_DATE_COLUMNS.export_jobs.has('expires_at')).toBe(false);
  });

  it('bảng không có cột ngày nào trả về tập rỗng', () => {
    expect(BUSINESS_DATE_COLUMNS.management_levels.size).toBe(0);
  });

  it('isBusinessDateColumn khớp với bảng tra cứu', () => {
    expect(isBusinessDateColumn('execution_logs', 'period_start')).toBe(true);
    expect(isBusinessDateColumn('execution_logs', 'created_at')).toBe(false);
  });
});

describe('ISO → ngày nghiệp vụ', () => {
  it('UTC nửa đêm giữ nguyên ngày khi đọc ở giờ Việt Nam', () => {
    expect(isoToBusinessDate('2026-08-15T00:00:00.000+00:00', TZ)).toBe('2026-08-15');
  });

  it('mốc neo +07 đọc lại đúng ngày, không lùi một ngày', () => {
    expect(isoToBusinessDate('2026-08-14T17:00:00.000Z', TZ)).toBe('2026-08-15');
  });

  it('cuối ngày UTC vẫn ra đúng ngày Việt Nam kế tiếp', () => {
    expect(isoToBusinessDate('2026-08-14T23:30:00.000Z', TZ)).toBe('2026-08-15');
  });

  it('giá trị rác trả null thay vì Invalid Date', () => {
    expect(isoToBusinessDate('không-phải-ngày', TZ)).toBeNull();
  });
});

describe('vòng tròn ghi rồi đọc', () => {
  it('ngày không đổi sau khi ghi xuống rồi đọc lên', () => {
    for (const date of ['2026-01-01', '2026-08-15', '2026-12-31', '2027-02-28']) {
      const stored = businessDateToStorage(date, OFFSET);
      expect(isoToBusinessDate(stored, TZ)).toBe(date);
    }
  });
});

describe('mapRowFromStorage', () => {
  it('chỉ quy đổi cột ngày nghiệp vụ, giữ nguyên phần còn lại', () => {
    const mapped = mapRowFromStorage(
      'work_items',
      {
        code: 'HHL5DL01-01',
        planned_end: '2026-08-15T00:00:00.000+00:00',
        display_end: '2026-08-15T00:00:00.000+00:00',
        archived_at: '2026-08-15T09:30:00.000Z',
        effective_progress: 65,
      },
      TZ,
    );

    expect(mapped.planned_end).toBe('2026-08-15');
    expect(mapped.display_end).toBe('2026-08-15');
    // Mốc thời gian phải giữ nguyên đủ giờ phút.
    expect(mapped.archived_at).toBe('2026-08-15T09:30:00.000Z');
    expect(mapped.effective_progress).toBe(65);
    expect(mapped.code).toBe('HHL5DL01-01');
  });

  it('bỏ qua giá trị null và chuỗi rỗng', () => {
    const mapped = mapRowFromStorage('work_items', { planned_end: null, completed_at: '' }, TZ);
    expect(mapped.planned_end).toBeNull();
    expect(mapped.completed_at).toBe('');
  });

  it('không mutate object đầu vào', () => {
    const input = { planned_end: '2026-08-15T00:00:00.000+00:00' };
    mapRowFromStorage('work_items', input, TZ);
    expect(input.planned_end).toBe('2026-08-15T00:00:00.000+00:00');
  });
});

describe('mapRowToStorage', () => {
  it('neo ngày nghiệp vụ vào 00:00 giờ Việt Nam', () => {
    const mapped = mapRowToStorage('work_items', { planned_end: '2026-08-15' }, OFFSET);
    expect(mapped.planned_end).toBe('2026-08-15T00:00:00.000+07:00');
  });

  it('giá trị đã là ISO thì để nguyên, không neo hai lần', () => {
    const iso = '2026-08-15T00:00:00.000+07:00';
    expect(mapRowToStorage('work_items', { planned_end: iso }, OFFSET).planned_end).toBe(iso);
  });

  it('không đụng tới cột mốc thời gian', () => {
    const mapped = mapRowToStorage('work_items', { archived_at: '2026-08-15' }, OFFSET);
    expect(mapped.archived_at).toBe('2026-08-15');
  });
});

describe('tên trường hệ thống', () => {
  it('đổi tên trường domain sang metadata của Appwrite', () => {
    expect(toStorageField('created_at')).toBe('$createdAt');
    expect(toStorageField('updated_at')).toBe('$updatedAt');
    expect(toStorageField('id')).toBe('$id');
  });

  it('giữ nguyên cột nghiệp vụ', () => {
    expect(toStorageField('display_end')).toBe('display_end');
    expect(toStorageField('primary_assignee_id')).toBe('primary_assignee_id');
  });
});

describe('giá trị trong bộ lọc', () => {
  it('ngày trong điều kiện lọc được đổi sang ISO', () => {
    expect(mapFilterValue('work_items', 'display_end', '2026-08-15', OFFSET)).toBe(
      '2026-08-15T00:00:00.000+07:00',
    );
  });

  it('cột không phải ngày giữ nguyên giá trị', () => {
    expect(mapFilterValue('work_items', 'status', 'IN_PROGRESS', OFFSET)).toBe('IN_PROGRESS');
    expect(mapFilterValue('work_items', 'year', 2026, OFFSET)).toBe(2026);
  });

  it('giá trị boolean và null không bị đụng tới', () => {
    expect(mapFilterValue('work_items', 'is_archived', false, OFFSET)).toBe(false);
    expect(mapFilterValue('work_items', 'display_end', null, OFFSET)).toBeNull();
  });
});
