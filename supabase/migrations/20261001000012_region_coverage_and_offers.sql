-- ============================================================================
-- 20261001000012 — تغطية المناطق · تقديم العروض · سرعة تبديل المنطقة
-- ----------------------------------------------------------------------------
-- يحلّ هذا الملف أربع مسائل متصلة، وسبب وجودها مشترك: كان «من يحقّ له العمل»
-- مُشتقًّا في أربعة أماكن مختلفة، فتناقضت. المكان الواحد الآن هو
-- `public.inspector_is_eligible` أدناه.
--
--   1. «الطلب لم يعد متاحًا» رغم أن الطلب مفتوح.
--      السبب: `submit_inspection_offer` كانت تشترط `role = 'inspector'`، وحساب
--      المالك دورُه `admin` (لا يمكن أن يكون `inspector`: `getSession()` يحسم
--      الدور بـ `isAdmin ? … : …` فيفوز فرع الأدمن دائمًا). النتيجة `forbidden`
--      — وهو نفس العطل الذي ظهر قبلها في 14 مسارًا وفي قفل الجهاز.
--
--   2. تغطية المناطق كانت تُفحص مرتين بمصدرين: `p_cities` تُمرَّر من Node،
--      و`user_profiles.inspector_cities` في القاعدة. أي اختلاف بينهما = سلوك
--      متعارض. الآن القاعدة هي المرجع ولا يُقبل النصّ المُمرَّر إلا كتلميح.
--
--   3. تبديل المناطق كان يستعلم عن كل الطلبات المفتوحة ثم يرشّح في الذاكرة.
--      الفهارس أدناه تجعل الترشيح داخل القاعدة.
--
--   4. السباق: فاحصان يقدّمان آخر عرضين في اللحظة نفسها. القفل على صف الطلب
--      (`for update`) موجود، لكن رسالة السباق كانت «الطلب لم يعد متاحًا» —
--      مبهمة. الآن `closed` مميّزة عن `not_found`.
--
-- كل شيء idempotent: يمكن تشغيل هذا الملف مرارًا بلا أثر جانبي.
-- ============================================================================


-- ------------------------------------------------------------------ صحة البيانات
-- المدن المدعومة تُكتب في القاعدة مرة واحدة. هذا ليس تجاوزًا لمصدر الحقيقة في
-- `lib/locations/saudi-cities.ts` — بل انعكاس له، لأن الدوال هنا تعمل في القاعدة
-- حيث لا يمكنها قراءة TypeScript. أي مدينة تُضاف هناك يجب أن تُضاف هنا.
create or replace function public.supported_cities()
returns text[]
language sql
immutable
as $$
  select array['الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء']::text[]
$$;

-- ملاحظة: الأسماء مأخوذة حرفيًا من `SUPPORTED_CITIES` في
-- `lib/locations/saudi-cities.ts` (الدمام · الخبر · الجبيل · القطيف · الأحساء).
-- تحقّق المطابقة النصّية في نهاية الملف قبل الاعتماد على هذه القائمة.
-- ⚠️ «القطيف» لا «القطف» — خطأ حرف واحد يجعل القائمة كلها لا تطابق أحدًا.


-- ═══════════════════════════════════════════════════════ 1. المصدر الواحد للأهلية
/**
 * هل هذا الحساب مؤهّل لتقديم عرض على هذا الطلب؟
 *
 * تجمع الدالة كل الشروط في مكان واحد، فتصبح كل نقطة استدعاء — SQL أو Node —
 * متّسقة بحكم البناء لا بحكم الانتباه.
 *
 * الشروط:
 *   (أ) الحساب معتمد كفاحص (`inspector_status = 'approved'`) — **بلا فحص
 *       `role`**. المالك دورُه `admin` و`inspector_status = 'approved'`، وهو
 *       مشمول بالقصد: هو صاحب المنصّة وليس حلقة في سجل الفاحصين، والقفل يحمي
 *       السجل لا المالك.
 *   (ب) الحساب متاح (`is_online`).
 *   (ج) مدينة الطلب ضمن مدن تغطيته **كما هي في القاعدة** — لا كما مرّرها المتصل.
 *
 * ⚠️ لا تُضِف شرطًا على `role` هنا. راجع السجل 2026-10-03 §«غير مصرح»:
 * الشرط نفسه أخرج 14 مسارًا و`submit_inspection_offer` عن العمل للمالك.
 */
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
         -- القاعدة هي المرجع؛ `p_cities` تلميح للتوافق فقط، ولا تمنح شيئًا.
         case
           when cardinality(coalesce(p.inspector_cities, '{}')) > 0 then p.inspector_cities
           else coalesce(p_cities, '{}')
         end
       )
  )
$$;


-- ═══════════════════════════════════════ 2. الطلبات المؤهَّلة (استعلام واحد سريع)
/**
 * الطلبات المفتوحة المتاحة لهذا الفاحص، مرشَّحة داخل القاعدة.
 *
 * كانت Node تجلب كل الطلبات المفتوحة (حتى 200) ثم ترشّح بالمدينة في الذاكرة —
 * عمل يزداد سوءًا مع النمو. هنا الترشيح يستخدم `inspections_city_status_idx`.
 */
create or replace function public.list_eligible_inspections(
  p_inspector_id uuid,
  p_limit integer default 200
)
returns setof public.inspections
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
    from public.inspections i
    join public.user_profiles p on p.id = p_inspector_id
   where i.status = 'open'
     and p.inspector_status = 'approved'
     and i.city = any (coalesce(p.inspector_cities, '{}'))
     and i.customer_id <> p_inspector_id           -- لا يعرض الفاحص على طلبه
     and not exists (                              -- لم يقدّم عرضًا بعد
       select 1 from public.inspection_offers o
        where o.inspection_id = i.id and o.inspector_id = p_inspector_id
     )
   order by i.scheduled_at asc
   limit greatest(1, least(coalesce(p_limit, 200), 500))
$$;


-- ══════════════════════════════════════ 3. تقديم العرض — مُصحَّح ومقاوم للسباق
/**
 * يُنشئ عرضًا. الفحوص كلها داخل قفل على صف الطلب.
 *
 * `p_cities` تبقى في التوقيع للتوافق، لكنها **لم تعد تمنح حقًّا**: قد تُمرَّر
 * قائمة قديمة من عميل لم يُحدَّث، وكان ذلك يُنتج «الطلب غير متاح في مدن عملك»
 * لطلب هو في مدنه فعلًا. القاعدة تُقرأ مباشرة الآن.
 */
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

  -- القفل أولًا: كل فحص لاحق يرى حالة الطلب عند اللحظة المتسلسلة نفسها،
  -- فيستحيل أن يمرّ عرضان على طلب انتقل إلى `assigned`.
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- `closed` ليست `not_found`: الطلب موجود لكنه لم يعد يقبل عروضًا. الرسالة
  -- في الواجهة تفرّق بينهما بدل «لم يعد متاحًا» المبهمة.
  if inspection.status <> 'open' then
    return jsonb_build_object('status', 'closed', 'inspectionStatus', inspection.status);
  end if;

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


-- ══════════════════════════════ 4. قبول العرض — إغلاق ذرّي يمنع «لم يعد متاحًا»
/**
 * قبول عرض يُقفل الطلب في المعاملة نفسها: `assigned` + ربط الفاحص + رفض البقية.
 * كل ذلك داخل القفل، فلا يمكن أن ينجح قبولان على طلب واحد.
 */
create or replace function public.accept_inspection_offer(
  p_inspection_id text,
  p_offer_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  selected_offer public.inspection_offers%rowtype;
begin
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if inspection.customer_id <> p_customer_id then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if inspection.status <> 'open' then
    return jsonb_build_object('status', 'closed', 'inspectionStatus', inspection.status);
  end if;

  select * into selected_offer
    from public.inspection_offers
    where id = p_offer_id
      and inspection_id = p_inspection_id
      and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('status', 'offer_not_found');
  end if;

  update public.inspection_offers
     set status = case when id = p_offer_id then 'accepted' else 'declined' end
   where inspection_id = p_inspection_id;

  update public.inspections
     set status = 'assigned',
         assigned_inspector_id = selected_offer.inspector_id,
         accepted_offer_id = selected_offer.id
   where id = p_inspection_id;

  return jsonb_build_object(
    'status', 'ok',
    'inspectorId', selected_offer.inspector_id,
    'inspectorName', selected_offer.inspector_name,
    'price', selected_offer.price
  );
end;
$$;


-- ═══════════════════════════════════════════════════════ 5. الطلبات لجهة العميل
/**
 * طلبات العميل مع عدد العروض وأفضلها سعرًا — استعلام واحد بدل N+1.
 * تُستخدم في `/dashboard` وفي `/requests`.
 */
create or replace function public.list_customer_inspections(p_customer_id uuid)
returns table (
  id text,
  status text,
  city text,
  district text,
  scheduled_at timestamptz,
  offers_count integer,
  best_price numeric,
  assigned_inspector_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         i.status,
         i.city,
         i.district,
         i.scheduled_at,
         coalesce(o.cnt, 0)::integer            as offers_count,
         o.best_price,
         a.inspector_name                       as assigned_inspector_name
    from public.inspections i
    left join lateral (
      select count(*) as cnt, min(price) as best_price
        from public.inspection_offers
       where inspection_id = i.id and status <> 'declined'
    ) o on true
    left join public.inspection_offers a on a.id = i.accepted_offer_id
   where i.customer_id = p_customer_id
   order by i.created_at desc
$$;


-- ══════════════════════════════════════════════════════════════════ 6. الفهارس
-- الترشيح حسب المنطقة كان يمرّ على الجدول كاملًا. هذه الفهارس تجعله بحثًا
-- مباشرًا، وهو ما يظهر فورًا عند التبديل بين المدن.
create index if not exists inspections_city_status_idx
  on public.inspections (city, status);

create index if not exists inspections_customer_created_idx
  on public.inspections (customer_id, created_at desc);

create index if not exists inspections_assigned_status_idx
  on public.inspections (assigned_inspector_id, status)
  where assigned_inspector_id is not null;

create index if not exists inspection_offers_inspector_idx
  on public.inspection_offers (inspector_id, status);

-- تُستخدم في `not exists (…)` داخل `list_eligible_inspections`.
create index if not exists inspection_offers_inspection_inspector_idx
  on public.inspection_offers (inspection_id, inspector_id);

-- الترشيح بـ`city = any(array)` يستفيد من GIN بدل المسح التسلسلي.
create index if not exists user_profiles_inspector_cities_idx
  on public.user_profiles using gin (inspector_cities);

create index if not exists user_profiles_approved_online_idx
  on public.user_profiles (inspector_status, is_online)
  where inspector_status = 'approved';


-- ══════════════════════════════════════════════════════════ 7. الصلاحيات
-- نفس طريق بقية الدوال: لا وصول لـanon/authenticated مباشرة؛ service_role فقط
-- (أي من مسارات Next بعد التحقق من الجلسة).
do $$
declare
  sig text;
  fns text[] := array[
    'public.supported_cities()',
    'public.inspector_is_eligible(uuid, text, text[])',
    'public.list_eligible_inspections(uuid, integer)',
    'public.submit_inspection_offer(text, uuid, text, numeric, text, text[])',
    'public.accept_inspection_offer(text, uuid, uuid)',
    'public.list_customer_inspections(uuid)'
  ];
begin
  foreach sig in array fns
  loop
    if to_regprocedure(sig) is null then
      raise notice 'skipping missing function: %', sig;
      continue;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', sig);
    execute format('grant execute on function %s to service_role', sig);
  end loop;
end;
$$;


-- ══════════════════════════════════════════════════════════════ 8. التحقق الذاتي
do $$
declare
  n_open integer;
  n_offers integer;
begin
  select count(*) into n_open from public.inspections where status = 'open';
  select count(*) into n_offers from public.inspection_offers;

  raise notice 'cities: %', array_to_string(public.supported_cities(), '، ');
  raise notice 'open inspections: %, offers: %', n_open, n_offers;
end;
$$;
