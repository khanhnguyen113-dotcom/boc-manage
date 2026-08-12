import 'server-only';

import { cache } from 'react';

import type {
  CapacitySetting,
  Holiday,
  ManagementLevel,
  OrganizationalUnit,
  Profile,
  SystemSetting,
  WorkCategory,
} from '@/domain/types';

import { getStore, type Row } from '../db/store';

/**
 * Bảng danh mục: nhỏ, ít đổi, đọc nhiều. `cache()` của React gom mọi lần gọi trong **cùng một
 * request** thành một lần đọc store — không phải cache xuyên request (guideline 4.2: không cache
 * quyền/dữ liệu lâu dài).
 */

export const listUnits = cache(async (): Promise<OrganizationalUnit[]> => {
  const store = await getStore();
  const rows = await store.all<Row & OrganizationalUnit>('organizational_units', {
    sort: [{ field: 'sort_order', dir: 'asc' }],
  });
  return rows;
});

export const listManagementLevels = cache(async (): Promise<ManagementLevel[]> => {
  const store = await getStore();
  return store.all<Row & ManagementLevel>('management_levels', {
    sort: [{ field: 'sort_order', dir: 'asc' }],
  });
});

export const listCategories = cache(async (): Promise<WorkCategory[]> => {
  const store = await getStore();
  return store.all<Row & WorkCategory>('work_categories', {
    sort: [{ field: 'sort_order', dir: 'asc' }],
  });
});

export const listProfiles = cache(async (): Promise<Profile[]> => {
  const store = await getStore();
  return store.all<Row & Profile>('profiles', { sort: [{ field: 'full_name', dir: 'asc' }] });
});

export const listActiveProfiles = cache(async (): Promise<Profile[]> => {
  return (await listProfiles()).filter((p) => p.status === 'ACTIVE');
});

export const listHolidays = cache(async (): Promise<Holiday[]> => {
  const store = await getStore();
  return store.all<Row & Holiday>('holidays', { sort: [{ field: 'holiday_date', dir: 'asc' }] });
});

export const listCapacitySettings = cache(async (): Promise<CapacitySetting[]> => {
  const store = await getStore();
  return store.all<Row & CapacitySetting>('capacity_settings');
});

export const listSystemSettings = cache(async (): Promise<SystemSetting[]> => {
  const store = await getStore();
  return store.all<Row & SystemSetting>('system_settings');
});

export const getSystemSetting = cache(async <T,>(key: string, fallback: T): Promise<T> => {
  const settings = await listSystemSettings();
  const setting = settings.find((s) => s.key === key);
  if (!setting) return fallback;
  try {
    return JSON.parse(setting.value_json) as T;
  } catch {
    return fallback;
  }
});

// --- tra cứu nhanh -----------------------------------------------------------

export const unitMap = cache(async (): Promise<Map<string, OrganizationalUnit>> => {
  return new Map((await listUnits()).map((u) => [u.id, u]));
});

export const profileMap = cache(async (): Promise<Map<string, Profile>> => {
  return new Map((await listProfiles()).map((p) => [p.user_id, p]));
});

export const categoryMap = cache(async (): Promise<Map<string, WorkCategory>> => {
  return new Map((await listCategories()).map((c) => [c.id, c]));
});

export const managementLevelMap = cache(async (): Promise<Map<string, ManagementLevel>> => {
  return new Map((await listManagementLevels()).map((m) => [m.id, m]));
});

/** Tên hiển thị an toàn: không bao giờ trả về chuỗi rỗng làm vỡ bảng. */
export async function resolveNames() {
  const [units, profiles, categories, levels] = await Promise.all([
    unitMap(),
    profileMap(),
    categoryMap(),
    managementLevelMap(),
  ]);

  return {
    unitName: (id: string | null | undefined) => (id ? (units.get(id)?.name ?? '—') : '—'),
    userName: (id: string | null | undefined) => (id ? (profiles.get(id)?.full_name ?? '—') : '—'),
    userAlias: (id: string | null | undefined) =>
      id ? (profiles.get(id)?.display_alias ?? profiles.get(id)?.full_name ?? '—') : '—',
    categoryName: (id: string | null | undefined) => (id ? (categories.get(id)?.name ?? '—') : '—'),
    categoryCode: (id: string | null | undefined) => (id ? (categories.get(id)?.code ?? null) : null),
    managementLevelName: (id: string | null | undefined) =>
      id ? (levels.get(id)?.name ?? '—') : '—',
    managementLevelCode: (id: string | null | undefined) =>
      id ? (levels.get(id)?.code ?? null) : null,
  };
}
