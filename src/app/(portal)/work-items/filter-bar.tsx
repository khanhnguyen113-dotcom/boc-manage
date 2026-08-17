'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/form';
import { PRIORITIES, SCHEDULE_TYPES, WORK_STATUSES } from '@/domain/catalogs';

/**
 * Thanh lọc. Mọi thay đổi ghi vào URL rồi `router.replace` — không giữ state song song,
 * nên nút back của trình duyệt hoàn tác đúng thao tác lọc.
 */
export function FilterBar({
  units,
  people,
  years,
}: {
  units: { id: string; name: string }[];
  people: { id: string; name: string }[];
  years: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    startTransition(() => router.replace(`/work-items?${params.toString()}`));
  };

  const clearAll = () => startTransition(() => router.replace('/work-items'));

  const activeCount = [...searchParams.keys()].filter(
    (k) => !['page', 'pageSize', 'sort', 'dir'].includes(k),
  ).length;

  return (
    <div className="space-y-3" aria-busy={pending}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('q');
          setParam('q', typeof value === 'string' ? value : '');
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]"
          />
          <Input
            name="q"
            type="search"
            defaultValue={searchParams.get('q') ?? ''}
            placeholder="Tìm theo mã, tên công việc hoặc kết quả đầu ra…"
            className="pl-9"
            aria-label="Tìm kiếm công việc"
          />
        </div>
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Cấp"
          value={searchParams.get('level') ?? ''}
          onChange={(v) => setParam('level', v)}
          options={[
            { value: '3', label: 'Lớp 3' },
            { value: '4', label: 'Lớp 4' },
            { value: '5', label: 'Lớp 5' },
            { value: '6', label: 'Lớp 6' },
          ]}
        />
        <FilterSelect
          label="Trạng thái"
          value={searchParams.get('status') ?? ''}
          onChange={(v) => setParam('status', v)}
          options={[
            { value: 'open', label: 'Đang mở' },
            ...WORK_STATUSES.map((s) => ({ value: s.code, label: s.label })),
          ]}
        />
        <FilterSelect
          label="Ưu tiên"
          value={searchParams.get('priority') ?? ''}
          onChange={(v) => setParam('priority', v)}
          options={PRIORITIES.map((p) => ({ value: p.code, label: p.label }))}
        />
        <FilterSelect
          label="Loại lịch"
          value={searchParams.get('schedule') ?? ''}
          onChange={(v) => setParam('schedule', v)}
          options={SCHEDULE_TYPES.map((s) => ({ value: s.code, label: s.label }))}
        />
        <FilterSelect
          label="Đơn vị"
          value={searchParams.get('unit') ?? ''}
          onChange={(v) => setParam('unit', v)}
          options={units.map((u) => ({ value: u.id, label: u.name }))}
        />
        <FilterSelect
          label="Người thực hiện"
          value={searchParams.get('assignee') ?? ''}
          onChange={(v) => setParam('assignee', v)}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FilterSelect
          label="Năm"
          value={searchParams.get('year') ?? ''}
          onChange={(v) => setParam('year', v)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
        <FilterSelect
          label="Cảnh báo"
          value={searchParams.get('warning') ?? ''}
          onChange={(v) => setParam('warning', v)}
          options={[
            { value: 'overdue', label: 'Quá hạn' },
            { value: 'due_today', label: 'Đến hạn hôm nay' },
            { value: 'due_2', label: 'Còn 1–2 ngày' },
            { value: 'due_7', label: 'Còn 3–7 ngày' },
            { value: 'near_due', label: 'Sắp đến hạn' },
            { value: 'missing_assignee', label: 'Chưa có người thực hiện' },
            { value: 'no_deadline', label: 'Chưa có hạn' },
          ]}
        />
        <FilterSelect
          label="Chất lượng"
          value={searchParams.get('dq') ?? ''}
          onChange={(v) => setParam('dq', v)}
          options={[
            { value: 'VALID', label: 'Đủ dữ liệu' },
            { value: 'INCOMPLETE', label: 'Thiếu dữ liệu' },
            { value: 'INVALID', label: 'Dữ liệu sai' },
          ]}
        />

        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={clearAll} type="button">
            <X aria-hidden className="size-3.5" />
            Xóa bộ lọc ({activeCount})
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="sr-only">{label}</span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="min-h-9 w-auto min-w-[8.5rem] py-1.5 text-xs"
      >
        <option value="">{label}: tất cả</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
