/**
 * Vai trò, capability và phạm vi dữ liệu — guideline mục 4.
 *
 * ```
 * effective_permission = role_baseline
 *                      + per_user_capabilities
 *                      + organizational_scope
 *                      + record_assignment/share
 *                      − explicit_denials
 * ```
 *
 * Thứ tự ưu tiên: inactive/deny → explicit capability → role → scope.
 * Tầng này thuần logic; việc **áp dụng** nằm ở `src/server/policies` (ADR-004).
 */

import type { RoleCode, ScopeType, WorkItem } from './types';

// ---------------------------------------------------------------------------
// Capability catalog — guideline 4.3
// ---------------------------------------------------------------------------

export const CAPABILITIES = [
  'portal.access',
  'dashboard.view_org',
  'dashboard.view_unit',
  'dashboard.view_self',
  'work.view',
  'work.create_l3',
  'work.create_child',
  'work.edit_core',
  'work.assign',
  'work.change_priority',
  'work.change_status',
  'work.update_progress',
  'work.complete',
  'work.submit_completion',
  'work.approve_completion',
  'work.cancel',
  'work.archive',
  'work.delete',
  'work.view_sensitive',
  'execution_log.create',
  'execution_log.edit_own',
  'comment.create',
  'comment.moderate',
  'file.upload',
  'file.download',
  'file.delete_own',
  'report.view',
  'report.export',
  'user.manage',
  'permission.manage',
  'organization.manage',
  'catalog.manage',
  'calendar.manage',
  'settings.manage',
  'import.execute',
  'audit.view',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'portal.access': 'Truy cập hệ thống',
  'dashboard.view_org': 'Xem Control Tower toàn BOC',
  'dashboard.view_unit': 'Xem Control Tower theo đơn vị',
  'dashboard.view_self': 'Xem tổng quan của cá nhân',
  'work.view': 'Xem công việc',
  'work.create_l3': 'Tạo công việc L3',
  'work.create_child': 'Tạo công việc con từ L4 trở xuống',
  'work.edit_core': 'Sửa nội dung cốt lõi',
  'work.assign': 'Giao/đổi người thực hiện',
  'work.change_priority': 'Đổi mức độ ưu tiên',
  'work.change_status': 'Đổi trạng thái',
  'work.update_progress': 'Cập nhật tiến độ',
  'work.complete': 'Hoàn thành công việc',
  'work.submit_completion': 'Gửi kết quả hoàn thành',
  'work.approve_completion': 'Duyệt kết quả hoàn thành',
  'work.cancel': 'Hủy công việc',
  'work.archive': 'Lưu trữ công việc',
  'work.delete': 'Xóa công việc',
  'work.view_sensitive': 'Xem nội dung nhạy cảm',
  'execution_log.create': 'Ghi nhật ký thực hiện',
  'execution_log.edit_own': 'Sửa nhật ký của mình',
  'comment.create': 'Bình luận',
  'comment.moderate': 'Kiểm duyệt bình luận',
  'file.upload': 'Tải tệp lên',
  'file.download': 'Tải tệp về',
  'file.delete_own': 'Xóa tệp của mình',
  'report.view': 'Xem báo cáo',
  'report.export': 'Xuất báo cáo',
  'user.manage': 'Quản trị người dùng',
  'permission.manage': 'Quản trị phân quyền',
  'organization.manage': 'Quản trị cơ cấu đơn vị',
  'catalog.manage': 'Quản trị danh mục',
  'calendar.manage': 'Quản trị ngày nghỉ/lịch',
  'settings.manage': 'Quản trị cấu hình',
  'import.execute': 'Chạy import dữ liệu',
  'audit.view': 'Xem audit log',
};

// ---------------------------------------------------------------------------
// Role baseline — guideline 4.4
// ---------------------------------------------------------------------------

const MEMBER_BASE: Capability[] = [
  'portal.access',
  'dashboard.view_self',
  'work.view',
  // Mọi thành viên đều được chủ động tạo công việc và phân rã tiếp thành công việc con.
  // Quyền nhìn/ghi trên từng nhánh vẫn được kiểm tra riêng bởi scope và record relation.
  'work.create_l3',
  'work.create_child',
  'work.update_progress',
  'work.change_status',
  'work.submit_completion',
  'work.approve_completion',
  'execution_log.create',
  'execution_log.edit_own',
  'comment.create',
  'file.upload',
  'file.download',
  'report.view',
];

const UNIT_MANAGER_BASE: Capability[] = [
  ...MEMBER_BASE,
  'dashboard.view_unit',
  'work.create_l3',
  'work.create_child',
  'work.edit_core',
  'work.assign',
  'work.change_priority',
  'work.complete',
  'work.approve_completion',
  'work.cancel',
  'work.archive',
  'work.delete',
  'comment.moderate',
  'report.export',
];

const BUSINESS_ADMIN_BASE: Capability[] = [
  ...UNIT_MANAGER_BASE,
  'dashboard.view_org',
  'work.view_sensitive',
  'catalog.manage',
  'calendar.manage',
  // Tham số như lịch làm việc, ngưỡng cận tải, cách cuộn tiến độ là **quyết định nghiệp vụ**
  // (xem NEED_CONFIRMATION mục B) — người quản trị nghiệp vụ phải sửa được, không phải chờ
  // quản trị kỹ thuật.
  'settings.manage',
  'import.execute',
  'file.delete_own',
  'user.manage',
  'audit.view',
];

/** Super admin vận hành hệ thống: có toàn bộ capability và scope toàn BOC. */
const SYSTEM_ADMIN_BASE: Capability[] = [...CAPABILITIES];

export const ROLE_BASELINE: Record<RoleCode, readonly Capability[]> = {
  system_admin: SYSTEM_ADMIN_BASE,
  // Guideline 4.4: giám đốc BOC có mặt ở mọi dòng của ma trận quyền (✓ hoặc S).
  boc_director: [...CAPABILITIES],
  business_admin: BUSINESS_ADMIN_BASE,
  unit_manager: UNIT_MANAGER_BASE,
  member: MEMBER_BASE,
  viewer: ['portal.access', 'work.view', 'report.view', 'dashboard.view_self', 'file.download'],
  auditor: ['portal.access', 'work.view', 'report.view', 'report.export', 'audit.view', 'dashboard.view_org'],
};

/** Mức “quyền lực” để so sánh nhanh khi cần vai trò cao hơn. */
export const ROLE_RANK: Record<RoleCode, number> = {
  viewer: 1,
  auditor: 2,
  member: 3,
  unit_manager: 4,
  business_admin: 5,
  boc_director: 6,
  system_admin: 6,
};

// ---------------------------------------------------------------------------
// Actor & effective permission
// ---------------------------------------------------------------------------

export interface ScopeGrant {
  scope_type: ScopeType;
  unit_id: string | null;
  include_children: boolean;
}

export interface Actor {
  user_id: string;
  full_name: string;
  is_active: boolean;
  roles: RoleCode[];
  primary_unit_id: string | null;
  /** Đơn vị người này quản lý (kể cả đơn vị con nếu `include_children`). */
  managed_unit_ids: string[];
  scopes: ScopeGrant[];
  /** Capability cấp thêm cho riêng user. */
  granted: Capability[];
  /** Capability bị thu hồi — luôn thắng mọi nguồn khác. */
  denied: Capability[];
}

export function effectiveCapabilities(actor: Actor): Set<Capability> {
  // Vô hiệu hóa ⇒ không còn quyền gì, có hiệu lực ngay ở request kế tiếp (guideline 4.2).
  if (!actor.is_active) return new Set();

  const set = new Set<Capability>();
  for (const role of actor.roles) {
    for (const cap of ROLE_BASELINE[role] ?? []) set.add(cap);
  }
  for (const cap of actor.granted) set.add(cap);
  for (const cap of actor.denied) set.delete(cap); // deny thắng
  return set;
}

export function hasCapability(actor: Actor, capability: Capability): boolean {
  return effectiveCapabilities(actor).has(capability);
}

// ---------------------------------------------------------------------------
// Data scope — guideline 4.5
// ---------------------------------------------------------------------------

export interface EffectiveScope {
  /** Thấy toàn bộ dữ liệu. */
  all: boolean;
  /** Đơn vị được phép xem. */
  unit_ids: Set<string>;
  /** Chỉ thấy việc liên quan trực tiếp tới mình. */
  self_only: boolean;
  user_id: string;
}

export function resolveScope(actor: Actor): EffectiveScope {
  if (!actor.is_active) {
    return { all: false, unit_ids: new Set(), self_only: true, user_id: actor.user_id };
  }

  const unitIds = new Set<string>(actor.managed_unit_ids);
  let all = false;
  let selfOnly = false;

  for (const scope of actor.scopes) {
    if (scope.scope_type === 'ALL') all = true;
    else if (scope.scope_type === 'UNIT' && scope.unit_id) unitIds.add(scope.unit_id);
    else if (scope.scope_type === 'SELF_ASSIGNED') selfOnly = true;
  }

  // boc_director / business_admin / auditor nhìn toàn BOC theo baseline vai trò.
  if (
    actor.roles.some(
      (r) =>
        r === 'system_admin' || r === 'boc_director' || r === 'business_admin' || r === 'auditor',
    )
  ) {
    all = true;
  }

  return { all, unit_ids: unitIds, self_only: selfOnly && !all && unitIds.size === 0, user_id: actor.user_id };
}

export interface WorkItemRelation {
  is_creator: boolean;
  is_lead: boolean;
  is_assignee: boolean;
  is_collaborator: boolean;
  /** Người này được xem một tổ tiên của node (guideline 4.5 điều 5). */
  inherits_from_ancestor: boolean;
}

export function relationTo(
  item: Pick<WorkItem, 'created_by' | 'lead_user_id' | 'primary_assignee_id'>,
  userId: string,
  collaboratorIds: readonly string[] = [],
  inheritsFromAncestor = false,
): WorkItemRelation {
  return {
    is_creator: item.created_by === userId,
    is_lead: item.lead_user_id === userId,
    is_assignee: item.primary_assignee_id === userId,
    is_collaborator: collaboratorIds.includes(userId),
    inherits_from_ancestor: inheritsFromAncestor,
  };
}

export function isRelated(relation: WorkItemRelation): boolean {
  return (
    relation.is_creator ||
    relation.is_lead ||
    relation.is_assignee ||
    relation.is_collaborator ||
    relation.inherits_from_ancestor
  );
}

/**
 * Guideline 4.5: đọc được work item nếu ít nhất một điều kiện đúng.
 * Mặc định **từ chối** (ADR-004).
 */
export function canReadWorkItem(
  actor: Actor,
  scope: EffectiveScope,
  item: Pick<WorkItem, 'owning_unit_id' | 'created_by' | 'lead_user_id' | 'primary_assignee_id'>,
  relation: WorkItemRelation,
): boolean {
  if (!hasCapability(actor, 'work.view')) return false;
  if (scope.all) return true;
  if (scope.unit_ids.has(item.owning_unit_id)) return true;
  return isRelated(relation);
}

/**
 * Sửa: cần capability tương ứng **và** quyền ghi trên record.
 * Quyền xem hậu duệ không tự động cho quyền sửa tổ tiên (guideline 4.5).
 */
export function canWriteWorkItem(
  actor: Actor,
  scope: EffectiveScope,
  capability: Capability,
  item: Pick<WorkItem, 'owning_unit_id' | 'created_by' | 'lead_user_id' | 'primary_assignee_id' | 'is_archived'>,
  relation: WorkItemRelation,
): boolean {
  if (item.is_archived) return false;
  if (!hasCapability(actor, capability)) return false;
  if (scope.all) return true;
  if (scope.unit_ids.has(item.owning_unit_id)) return true;
  // Member chỉ được ghi trên việc của chính mình, và không qua thừa kế tổ tiên.
  return relation.is_creator || relation.is_lead || relation.is_assignee;
}
