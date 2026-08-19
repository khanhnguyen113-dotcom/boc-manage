import { describe, expect, it } from 'vitest';

import {
  CAPABILITIES,
  ROLE_BASELINE,
  canReadWorkItem,
  canWriteWorkItem,
  effectiveCapabilities,
  hasCapability,
  relationTo,
  resolveScope,
  type Actor,
} from '@/domain/permissions';
import { makeWorkItem } from '@/tests/factories';

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    user_id: 'u1',
    full_name: 'Người dùng',
    is_active: true,
    roles: ['member'],
    primary_unit_id: 'unit-dl',
    managed_unit_ids: [],
    scopes: [{ scope_type: 'SELF_ASSIGNED', unit_id: null, include_children: false }],
    granted: [],
    denied: [],
    ...overrides,
  };
}

describe('effective capability', () => {
  it('member có quyền cập nhật tiến độ và tạo công việc, không có quyền giao việc', () => {
    const a = actor();
    expect(hasCapability(a, 'work.update_progress')).toBe(true);
    expect(hasCapability(a, 'work.create_l3')).toBe(true);
    expect(hasCapability(a, 'work.create_child')).toBe(true);
    expect(hasCapability(a, 'work.assign')).toBe(false);
    expect(hasCapability(a, 'work.submit_completion')).toBe(true);
    expect(hasCapability(a, 'work.approve_completion')).toBe(true);
    expect(hasCapability(a, 'work.delete')).toBe(false);
  });

  it('chỉ cấp quản lý trở lên có capability xóa công việc', () => {
    expect(hasCapability(actor({ roles: ['unit_manager'] }), 'work.delete')).toBe(true);
    expect(hasCapability(actor({ roles: ['business_admin'] }), 'work.delete')).toBe(true);
    expect(hasCapability(actor({ roles: ['boc_director'] }), 'work.delete')).toBe(true);
    expect(hasCapability(actor({ roles: ['system_admin'] }), 'work.delete')).toBe(true);
  });

  it('capability cấp thêm cho riêng user có hiệu lực', () => {
    const a = actor({ granted: ['work.create_child'] });
    expect(hasCapability(a, 'work.create_child')).toBe(true);
  });

  it('deny thắng cả role lẫn grant', () => {
    const a = actor({
      roles: ['boc_director'],
      granted: ['work.complete'],
      denied: ['work.complete'],
    });
    expect(hasCapability(a, 'work.complete')).toBe(false);
  });

  it('user bị vô hiệu hóa mất toàn bộ quyền ngay ở request kế tiếp', () => {
    const a = actor({ roles: ['boc_director'], is_active: false });
    expect(effectiveCapabilities(a).size).toBe(0);
    expect(hasCapability(a, 'portal.access')).toBe(false);
  });

  it('system_admin là super admin có toàn bộ capability', () => {
    const a = actor({ roles: ['system_admin'] });
    expect(hasCapability(a, 'settings.manage')).toBe(true);
    expect(hasCapability(a, 'audit.view')).toBe(true);
    expect(hasCapability(a, 'work.edit_core')).toBe(true);
    expect(hasCapability(a, 'work.view')).toBe(true);
    expect(effectiveCapabilities(a).size).toBe(CAPABILITIES.length);
  });

  it('auditor xem và xuất báo cáo nhưng không sửa nghiệp vụ', () => {
    const a = actor({ roles: ['auditor'] });
    expect(hasCapability(a, 'report.export')).toBe(true);
    expect(hasCapability(a, 'audit.view')).toBe(true);
    expect(hasCapability(a, 'work.update_progress')).toBe(false);
  });

  it('tham số nghiệp vụ do người quản trị nghiệp vụ và giám đốc BOC sửa, không phải quản trị kỹ thuật', () => {
    expect(hasCapability(actor({ roles: ['business_admin'] }), 'settings.manage')).toBe(true);
    expect(hasCapability(actor({ roles: ['boc_director'] }), 'settings.manage')).toBe(true);
    expect(hasCapability(actor({ roles: ['unit_manager'] }), 'settings.manage')).toBe(false);
    expect(hasCapability(actor({ roles: ['member'] }), 'settings.manage')).toBe(false);
  });

  it('viewer chỉ đọc', () => {
    const a = actor({ roles: ['viewer'] });
    expect(hasCapability(a, 'work.view')).toBe(true);
    expect(hasCapability(a, 'comment.create')).toBe(false);
  });

  // `/admin/users` in thẳng ROLE_BASELINE ra ma trận quyền kèm số đếm. Baseline lặp phần tử
  // thì màn hình báo sai số capability và lặp dòng, dù `hasCapability` vẫn đúng vì dùng Set.
  it('baseline của mọi vai trò không lặp capability', () => {
    for (const [role, capabilities] of Object.entries(ROLE_BASELINE)) {
      expect(new Set(capabilities).size, `vai trò ${role} có capability lặp`).toBe(
        capabilities.length,
      );
    }
  });

  it('baseline chỉ chứa capability có trong danh mục', () => {
    const known = new Set<string>(CAPABILITIES);
    for (const [role, capabilities] of Object.entries(ROLE_BASELINE)) {
      for (const capability of capabilities) {
        expect(known.has(capability), `vai trò ${role} có capability lạ: ${capability}`).toBe(true);
      }
    }
  });

  it('vai trò cao kế thừa trọn vẹn vai trò thấp', () => {
    const contains = (parent: readonly string[], child: readonly string[]) =>
      child.every((capability) => parent.includes(capability));
    expect(contains(ROLE_BASELINE.unit_manager, ROLE_BASELINE.member)).toBe(true);
    expect(contains(ROLE_BASELINE.business_admin, ROLE_BASELINE.unit_manager)).toBe(true);
  });
});

describe('data scope', () => {
  it('boc_director thấy toàn BOC', () => {
    expect(resolveScope(actor({ roles: ['boc_director'] })).all).toBe(true);
  });

  it('system_admin thấy toàn BOC', () => {
    expect(resolveScope(actor({ roles: ['system_admin'] })).all).toBe(true);
  });

  it('unit_manager thấy đơn vị mình quản lý', () => {
    const scope = resolveScope(
      actor({ roles: ['unit_manager'], managed_unit_ids: ['unit-rd', 'unit-dl'] }),
    );
    expect(scope.all).toBe(false);
    expect(scope.unit_ids.has('unit-rd')).toBe(true);
  });

  it('member mặc định chỉ thấy việc của mình', () => {
    const scope = resolveScope(actor());
    expect(scope.all).toBe(false);
    expect(scope.self_only).toBe(true);
  });

  it('user bị vô hiệu hóa không còn scope', () => {
    const scope = resolveScope(actor({ roles: ['boc_director'], is_active: false }));
    expect(scope.all).toBe(false);
  });
});

describe('đọc work item — guideline 4.5', () => {
  const item = makeWorkItem({
    owning_unit_id: 'unit-rd',
    created_by: 'u-other',
    lead_user_id: 'u-lead',
    primary_assignee_id: 'u-assignee',
  });

  it('scope ALL đọc được tất cả', () => {
    const a = actor({ roles: ['boc_director'] });
    const relation = relationTo(item, a.user_id);
    expect(canReadWorkItem(a, resolveScope(a), item, relation)).toBe(true);
  });

  it('quản lý đơn vị đọc được việc của đơn vị mình', () => {
    const a = actor({ roles: ['unit_manager'], managed_unit_ids: ['unit-rd'] });
    expect(canReadWorkItem(a, resolveScope(a), item, relationTo(item, a.user_id))).toBe(true);
  });

  it('người được giao đọc được dù khác đơn vị', () => {
    const a = actor({ user_id: 'u-assignee' });
    expect(canReadWorkItem(a, resolveScope(a), item, relationTo(item, 'u-assignee'))).toBe(true);
  });

  it('IDOR: member không liên quan bị chặn', () => {
    const a = actor({ user_id: 'u-nguoi-la' });
    expect(canReadWorkItem(a, resolveScope(a), item, relationTo(item, 'u-nguoi-la'))).toBe(false);
  });

  it('không có work.view thì chặn kể cả khi liên quan', () => {
    const a = actor({ user_id: 'u-assignee', denied: ['work.view'] });
    expect(canReadWorkItem(a, resolveScope(a), item, relationTo(item, 'u-assignee'))).toBe(false);
  });
});

describe('ghi work item', () => {
  const item = makeWorkItem({
    owning_unit_id: 'unit-rd',
    created_by: 'u-other',
    lead_user_id: 'u-lead',
    primary_assignee_id: 'u-assignee',
  });

  it('người được giao cập nhật được tiến độ', () => {
    const a = actor({ user_id: 'u-assignee' });
    expect(
      canWriteWorkItem(a, resolveScope(a), 'work.update_progress', item, relationTo(item, 'u-assignee')),
    ).toBe(true);
  });

  it('người được giao KHÔNG tự giao lại việc cho người khác', () => {
    const a = actor({ user_id: 'u-assignee' });
    expect(
      canWriteWorkItem(a, resolveScope(a), 'work.assign', item, relationTo(item, 'u-assignee')),
    ).toBe(false);
  });

  it('quyền thừa kế từ tổ tiên chỉ cho đọc, không cho ghi', () => {
    const a = actor({ user_id: 'u-xa-la' });
    const relation = relationTo(item, 'u-xa-la', [], true);
    expect(canReadWorkItem(a, resolveScope(a), item, relation)).toBe(true);
    expect(canWriteWorkItem(a, resolveScope(a), 'work.update_progress', item, relation)).toBe(false);
  });

  it('không ghi được lên bản ghi đã lưu trữ', () => {
    const archived = { ...item, is_archived: true };
    const a = actor({ roles: ['boc_director'] });
    expect(
      canWriteWorkItem(a, resolveScope(a), 'work.edit_core', archived, relationTo(archived, a.user_id)),
    ).toBe(false);
  });
});
