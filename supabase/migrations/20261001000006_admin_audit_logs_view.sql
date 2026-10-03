-- ============================================================================
-- 06 — عرض سجل التدقيق الإداري
-- ----------------------------------------------------------------------------
-- NON-DESTRUCTIVE: عرض (view) فقط. لا يُسقط جدولًا ولا يعدّل عمودًا.
-- إعادة التشغيل آمنة (create or replace).
--
-- لماذا عرض لا جدول جديد؟
--   `public.audit_events` موجود وهو أحادي الاتجاه (trigger يرفض UPDATE/DELETE).
--   إنشاء جدول ثانٍ كان سيكرّر البيانات ويضيف مسار كتابة ثانيًا أضعف.
--   هذا العرض يعرض الصفوف نفسها بأسماء الأعمدة التي تتوقّعها لوحة الإدارة:
--
--     اسم المواصفة   ->  العمود الفعلي
--     admin_id       ->  actor_id
--     action_type    ->  event_type
--     target_type    ->  resource_type
--     target_id      ->  resource_id
--     timestamp      ->  created_at
-- ============================================================================

create or replace view public.admin_audit_logs as
select
  id,
  actor_id      as admin_id,
  event_type    as action_type,
  resource_type as target_type,
  resource_id   as target_id,
  metadata,
  created_at    as "timestamp"
from public.audit_events;

comment on view public.admin_audit_logs is
  'Read-only compatibility view over audit_events using the admin_id/action_type/target_id/timestamp naming. Append-only: the underlying table rejects UPDATE and DELETE.';

-- العرض للقراءة فقط لأدوار الـAPI؛ الكتابة تمرّ عبر audit_events ليُطبَّق
-- trigger أحادية الاتجاه دائمًا.
revoke all on public.admin_audit_logs from public, anon, authenticated;
grant select on public.admin_audit_logs to service_role;
