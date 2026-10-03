-- ============================================================================
-- 10 — تصريح الوصول النهائي (deny-by-default)
-- ----------------------------------------------------------------------------
-- هذا المشروع **لا يستخدم مفتاح anon مطلقًا**. كل قراءة وكتابة تمرّ عبر الخادم
-- (`lib/supabase/server.ts`) بمفتاح service_role، وservice_role يتجاوز RLS
-- كليًا. لا يوجد `NEXT_PUBLIC_SUPABASE_*` في المشروع إطلاقًا.
--
-- لذلك: تمكين RLS بلا أي سياسة يقفل الوصول المجهول تمامًا ويترك التطبيق يعمل
-- كما هو. دفاع في العمق بحت: لو أُضيف مفتاح anon يومًا أو تسرّب فلن يمنح شيئًا.
--
-- هذا الملف يُعاد تشغيله بأمان: يعالج الجداول الموجودة فقط ويتخطّى الغائب.
-- ============================================================================

do $$
declare
  target text;
begin
  foreach target in array array[
    'user_profiles', 'inspections', 'inspection_offers', 'otp_challenges',
    'rate_limits', 'inspection_reports', 'inspection_media', 'audit_events',
    'inspector_applications', 'inspector_devices',
    'inspector_claims', 'field_actions', 'inspector_support_tickets',
    'inspector_handover_requests', 'inspector_badges', 'inspector_payout_requests'
  ]
  loop
    if to_regclass(format('public.%I', target)) is null then
      raise notice 'skipping missing table: %', target;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public, anon, authenticated', target);
    execute format('grant all on public.%I to service_role', target);
  end loop;
end;
$$;

-- التحقق (نفّذه يدويًا): المتوقع صفر صفوف.
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated');
