import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import {
  ALLOCATION_UNITS,
  EXECUTION_STATUSES,
  PRIORITIES,
  RECURRENCE_CYCLES,
  SCHEDULE_TYPES,
  WORK_STATUSES,
} from '@/domain/catalogs';
import { formatInteger } from '@/lib/format';
import { requireCapability } from '@/server/auth/current-user';
import { listCategories, listManagementLevels } from '@/server/repositories/catalogs';
import { listAllWorkItems } from '@/server/repositories/work-items';

export const metadata: Metadata = { title: 'Danh mục' };

export default async function AdminCatalogsPage() {
  await requireCapability('catalog.manage');

  const [levels, categories, items] = await Promise.all([
    listManagementLevels(),
    listCategories(),
    listAllWorkItems(),
  ]);

  const countBy = (key: 'management_level_id' | 'category_id', id: string) =>
    items.filter((item) => item[key] === id && !item.is_archived).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Danh mục"
        description="Lớp 1 và Lớp 2 là hai chiều phân loại quản trị. Các danh mục còn lại là enum cố định trong domain — đổi chúng đồng nghĩa đổi quy tắc nghiệp vụ nên không sửa được từ giao diện."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Lớp 1 — Cấp quản trị"
            description="Phân biệt việc cấp công ty và việc cấp phòng ban."
          />
          <ul className="divide-y divide-[var(--border)]">
            {levels.map((level) => (
              <li key={level.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block text-sm font-medium">{level.name}</span>
                  <code className="text-[11px] text-[var(--text-subtle)]">{level.code}</code>
                </span>
                <Link href={`/work-items?mlevel=${level.id}`}>
                  <Badge tone="info">{formatInteger(countBy('management_level_id', level.id))} việc</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Lớp 2 — Nhóm công việc BOC"
            description="Nhóm được đánh dấu “loại khỏi tiến độ TB” sẽ không tham gia mẫu số khi tính tiến độ trung bình quản trị."
          />
          <ul className="divide-y divide-[var(--border)]">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{category.name}</span>
                  <code className="text-[11px] text-[var(--text-subtle)]">{category.code}</code>
                  {category.exclude_from_progress_avg ? (
                    <Badge tone="warning" className="ml-2">
                      Loại khỏi tiến độ TB
                    </Badge>
                  ) : null}
                </span>
                <Link href={`/work-items?category=${category.id}`}>
                  <Badge tone="info">{formatInteger(countBy('category_id', category.id))} việc</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Danh mục cố định trong domain"
          description="Được định nghĩa trong mã nguồn cùng quy tắc chuyển trạng thái và cách tính. Muốn thay đổi phải sửa business rule và bổ sung test, không phải sửa dữ liệu."
        />
        <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <CatalogList title="Trạng thái công việc" entries={WORK_STATUSES} />
          <CatalogList title="Mức độ ưu tiên" entries={PRIORITIES} />
          <CatalogList title="Loại lịch" entries={SCHEDULE_TYPES} />
          <CatalogList title="Chu kỳ định kỳ" entries={RECURRENCE_CYCLES} />
          <CatalogList title="Đơn vị phân bổ" entries={ALLOCATION_UNITS} />
          <CatalogList title="Trạng thái kỳ" entries={EXECUTION_STATUSES} />
        </CardBody>
      </Card>
    </div>
  );
}

function CatalogList({
  title,
  entries,
}: {
  title: string;
  entries: readonly { code: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
        {title}
      </p>
      <ul className="space-y-1 text-sm">
        {entries.map((entry) => (
          <li key={entry.code} className="flex items-center justify-between gap-2">
            <span>{entry.label}</span>
            <code className="text-[10px] text-[var(--text-subtle)]">{entry.code}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
