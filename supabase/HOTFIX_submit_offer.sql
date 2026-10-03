-- ============================================================================
-- إصلاح عاجل: «الطلب خارج مدن عملك» عند إرسال عرض سعر
-- ----------------------------------------------------------------------------
-- الصق هذا الملف كاملًا في Supabase → SQL Editor → Run.
-- يفكّ العطل فورًا. آمن للتشغيل أكثر من مرة.
--
-- ── العطل ───────────────────────────────────────────────────────────────────
-- `submit_inspection_offer` كانت ترفض حساب المالك وتُعيد `forbidden`، لأنها
-- تشترط `role = 'inspector'` بينما دور المالك `admin`. و`getSession()` ترتّب
-- الدور هكذا:
--     isAdmin ? (elevated ? 'admin' : 'admin_pending') : (approved ? 'inspector' : 'customer')
-- فالمالك **لا يصبح `inspector` أبدًا** — فرع الأدمن يفوز دائمًا.
--
-- والنتيجة أن الرسالة الظاهرة «الطلب خارج مدن عملك» **خاطئة تمامًا**: المدن
-- سليمة والحالة متاحة والطلب مفتوح. السبب دورٌ مختلف، لا تغطية ناقصة.
--
-- ── الإصلاح ─────────────────────────────────────────────────────────────────
-- الشرط الصحيح هو `inspector_status = 'approved'` و`is_online` ومدينة الطلب
-- ضمن `inspector_cities` **المقروءة من القاعدة** — بلا أي فحص على `role`.
-- وهذا هو نفس المُسند الذي تستخدمه `isApprovedInspector()` في Node.
-- ============================================================================


-- ── 1. المصدر الواحد للأهلية ────────────────────────────────────────────────
create or replace function public.inspector_is_eligible(
  p_inspector_id uuid,
  p_city text,
  p_cities text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_profiles p
     where p.id = p_inspector_id
       and p.inspector_status = 'approved'
       and p.is_online
       and p_city = any (
         case
           when cardinality(coalesce(p.inspector_cities, '{}')) > 0 then p.inspector_cities
           else coalesce(p_cities, '{}')
         end
       )
  )
$$;


-- ── 2. تقديم العرض — الشرط المصحَّح، والحالة في القفل ───────────────────────
create or replace function public.submit_inspection_offer(
  p_inspection_id text,
  p_inspector_id uuid,
  p_inspector_name text,
  p_price numeric,
  p_note text,
  p_cities text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  offer_id uuid;
begin
  if p_price is null or p_price < 50 or p_price > 100000 then
    return jsonb_build_object('status', 'invalid_price');
  end if;

  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- `closed` مميّزة عن `not_found` لتعطي الواجهة رسالة دقيقة.
  if inspection.status <> 'open' then
    return jsonb_build_object('status', 'closed', 'inspectionStatus', inspection.status);
  end if;

  -- ⚠️ هنا كان الفحص المعطوب: `and role = 'inspector'` استُبدل بالأهلية الصحيحة.
  if not public.inspector_is_eligible(p_inspector_id, inspection.city, p_cities) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  insert into public.inspection_offers (inspection_id, inspector_id, inspector_name, price, note)
  values (p_inspection_id, p_inspector_id, p_inspector_name, p_price, p_note)
  on conflict (inspection_id, inspector_id) do nothing
  returning id into offer_id;

  if offer_id is null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  return jsonb_build_object('status', 'ok', 'offerId', offer_id);
end;
$$;
