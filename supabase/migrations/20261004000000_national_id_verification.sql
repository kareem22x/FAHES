-- ============================================================================
-- 14 — توثيق الهوية: رقم الهوية الوطنية + علامة التوثيق
-- ----------------------------------------------------------------------------
-- يضيف عمودين لجدول user_profiles: national_id (10 أرقام سعودية) و
-- national_id_verified_at (وقت الإدخال). العميل لا يُعتبر موثّقًا إلا لما
-- يوثّق جواله (عبر Clerk) ويُدخل رقم هويته.
--
-- idempotent: آمن للتشغيل على قاعدة موجودة.
-- ============================================================================

alter table public.user_profiles
  add column if not exists national_id text,
  add column if not exists national_id_verified_at timestamptz;

-- رقم الهوية السعودية: 10 أرقام تبدأ بـ 1 (سعودي) أو 2 (مقيم)
alter table public.user_profiles
  drop constraint if exists user_profiles_national_id_format;

alter table public.user_profiles
  add constraint user_profiles_national_id_format
  check (national_id is null or national_id ~ '^[12][0-9]{9}$');

-- فهرس فريد جزئي: رقم الهوية فريد لمن أدخله فقط
create unique index if not exists user_profiles_national_id_idx
  on public.user_profiles(national_id)
  where national_id is not null;
