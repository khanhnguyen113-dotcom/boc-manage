import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Link from 'next/link';

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
} from '@/components/ui/primitives';
import { TableShell, Td, Th, Tr } from '@/components/ui/table';
import { formatInteger } from '@/lib/format';
import { requireCapability } from '@/server/auth/current-user';

export const metadata: Metadata = { title: 'Import & đối soát' };

interface ExtractionReport {
  generated_at: string;
  source_file: string;
  source_sha256: string;
  source_range: string;
  totals: {
    rows_found: number;
    rows_accepted: number;
    rows_rejected: number;
    by_level: Record<string, number>;
  };
  issues: {
    source_sheet: string;
    source_row: number;
    code: string | null;
    field: string | null;
    error_code: string;
    message: string;
    raw_value: string | null;
  }[];
}

function loadReport(): ExtractionReport | null {
  try {
    const path = resolve(process.cwd(), 'data/seed/extraction-report.json');
    return JSON.parse(readFileSync(path, 'utf8')) as ExtractionReport;
  } catch {
    return null;
  }
}

/**
 * Trang đối soát import — guideline 12.5.
 *
 * Hiển thị đúng biên bản của lần trích dữ liệu gần nhất: nguồn nào, checksum bao nhiêu, nhận
 * bao nhiêu dòng, loại bao nhiêu dòng và **vì sao**. Không có dòng nào bị loại âm thầm.
 */
export default async function AdminImportsPage() {
  await requireCapability('import.execute');
  const report = loadReport();

  if (!report) {
    return (
      <div className="space-y-5">
        <PageHeader title="Import & đối soát" />
        <Card>
          <EmptyState
            title="Chưa có biên bản trích dữ liệu"
            description="Chạy `npm run extract:sheet` với bản chụp Google Sheet đã freeze để tạo biên bản."
          />
        </Card>
      </div>
    );
  }

  const byCode = new Map<string, number>();
  for (const issue of report.issues) {
    byCode.set(issue.error_code, (byCode.get(issue.error_code) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import & đối soát"
        description="Dữ liệu hiện tại được trích từ bản chụp Google Sheet nguồn. Giá trị dẫn xuất (tiến độ cha, ngày hiển thị, chất lượng dữ liệu) đều được tính lại bằng domain service, không mang số của Sheet sang."
      />

      <Alert tone="warning" title="Nguyên tắc import">
        Không tạo công việc cha giả để “chữa” dòng mồ côi; không import ô công thức lỗi; không dùng
        giá trị dẫn xuất của Sheet làm nguồn sự thật. Dòng vi phạm bị loại và ghi vào biên bản dưới
        đây để BOC xử lý tại nguồn.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <Stat label="Dòng đọc được" value={formatInteger(report.totals.rows_found)} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Đã nhận"
              value={formatInteger(report.totals.rows_accepted)}
              tone="success"
              hint={Object.entries(report.totals.by_level)
                .map(([level, count]) => `${level}: ${count}`)
                .join(' · ')}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Bị loại"
              value={formatInteger(report.totals.rows_rejected)}
              tone={report.totals.rows_rejected > 0 ? 'danger' : undefined}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat label="Vấn đề ghi nhận" value={formatInteger(report.issues.length)} tone="warning" />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Nguồn dữ liệu" description="Dùng để đối soát khi ký biên bản migration." />
        <CardBody className="space-y-2 text-sm">
          <p>
            <span className="text-[var(--text-subtle)]">Tệp nguồn:</span>{' '}
            <code className="font-mono text-xs">{report.source_file}</code>
          </p>
          <p>
            <span className="text-[var(--text-subtle)]">Vùng dữ liệu:</span>{' '}
            <code className="font-mono text-xs">{report.source_range}</code>
          </p>
          <p className="break-all">
            <span className="text-[var(--text-subtle)]">SHA-256:</span>{' '}
            <code className="font-mono text-xs">{report.source_sha256}</code>
          </p>
          <p>
            <span className="text-[var(--text-subtle)]">Thời điểm trích:</span>{' '}
            {new Date(report.generated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
          </p>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title={`Biên bản lỗi (${report.issues.length})`}
          description="Mỗi dòng chỉ rõ vị trí trong Sheet nguồn để người phụ trách dữ liệu sửa tại gốc."
          action={
            <span className="flex flex-wrap gap-1">
              {[...byCode.entries()].map(([code, count]) => (
                <Badge key={code} tone="warning">
                  {code}: {count}
                </Badge>
              ))}
            </span>
          }
        />

        {report.issues.length === 0 ? (
          <EmptyState title="Không có lỗi nào" description="Toàn bộ dòng trong vùng dữ liệu đều hợp lệ." />
        ) : (
          <TableShell caption="Biên bản lỗi import">
            <thead>
              <tr>
                <Th sticky>Sheet</Th>
                <Th align="right">Dòng</Th>
                <Th>Mã công việc</Th>
                <Th>Trường</Th>
                <Th>Mã lỗi</Th>
                <Th>Mô tả</Th>
                <Th>Giá trị gốc</Th>
              </tr>
            </thead>
            <tbody>
              {report.issues.map((issue, index) => (
                <Tr key={`${issue.source_row}-${issue.error_code}-${index}`}>
                  <Td sticky className="text-xs">
                    {issue.source_sheet}
                  </Td>
                  <Td align="right" className="text-xs">
                    {issue.source_row}
                  </Td>
                  <Td className="font-mono text-xs">{issue.code ?? '—'}</Td>
                  <Td className="text-xs text-[var(--text-muted)]">{issue.field ?? '—'}</Td>
                  <Td>
                    <Badge tone="danger">{issue.error_code}</Badge>
                  </Td>
                  <Td className="max-w-md text-xs">{issue.message}</Td>
                  <Td className="font-mono text-xs text-[var(--text-muted)]">
                    {issue.raw_value ?? '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card>
        <CardHeader title="Các bước còn lại trước cutover" />
        <CardBody>
          <ol className="list-inside list-decimal space-y-1 text-sm text-[var(--text-muted)]">
            <li>BOC sửa các dòng trong biên bản lỗi ngay trên Sheet nguồn.</li>
            <li>Freeze Sheet, xuất bản chụp mới và chạy lại trích dữ liệu.</li>
            <li>Đối soát tổng theo cấp, trạng thái, đơn vị và người phụ trách với biên bản đã ký.</li>
            <li>
              Chốt các quyết định còn treo trong{' '}
              <Link href="/admin/settings" className="underline">
                Tham số hệ thống
              </Link>{' '}
              trước khi đưa số liệu vào báo cáo chính thức.
            </li>
            <li>Cutover: webapp trở thành nguồn sự thật duy nhất, Sheet chuyển sang chỉ đọc.</li>
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
