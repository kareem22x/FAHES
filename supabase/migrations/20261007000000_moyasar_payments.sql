-- ============================================================================
-- 18 — الدفع الإلكتروني عبر Moyasar
-- ----------------------------------------------------------------------------
-- ── لماذا أعمدة مستقلة ولا حالة طلب جديدة ───────────────────────────────────
--
-- `inspections.status` مقيّد بـCHECK، ومفرداته مكرّرة في ثلاثة أماكن:
--   1. قيد CHECK في هذا المخطط (`open … cancelled`)
--   2. `InspectionStatus` في `lib/inspection-store.ts`
--   3. `statusMeta` / `inspectionFlow` / `isActiveStatus` في `lib/inspection-status.ts`
-- ومعه أكثر من ستة مقارنات مباشرة (`=== 'open'` و`'completed'`) في الواجهات
-- ومخازن البيانات. إضافة `'paid'` إلى تلك المفردات كانت ستعني تعديل المواضع
-- الثلاثة كلها، وترك كل مقارنة لم تُعدَّل في حالة خاطئة **بصمت**.
--
-- لذلك الدفع بُعد منفصل: حالة الطلب تبقى كما هي، والدفع يعيش في أعمدة خاصة به.
--
-- ── الحالات ────────────────────────────────────────────────────────────────
--
--   unpaid    — لا محاولة دفع (القيمة الابتدائية، وتشمل كل الصفوف السابقة)
--   initiated — أُنشئت محاولة دفع ولم تُحسم بعد
--   paid      — نجحت العملية وتطابق المبلغ والعملة (الحالة النهائية المرغوبة)
--   failed    — رُفضت العملية، والسبب في `payment_failure_reason`
--   refunded  — أُعيد المبلغ للعميل
--   voided    — أُبطل الحجز قبل التسوية
--
-- ── لماذا `payment_id` بفهرس فريد جزئي ─────────────────────────────────────
--
-- الـWebhook يصل بمعرّف الدفع وحده ولا يعرف الطلب. البحث يتم بـ`payment_id`،
-- لذا تكرار المعرّف بين صفّين يعني تحديث الطلب الخطأ. الفهرس الفريد يمنع ذلك
-- على مستوى القاعدة، وليس في الكود وحده.
--
-- `payment_amount` بالريال (الوحدات الكبرى) لا بالهللات، ليطابق `offers.price`
-- مباشرة عند المقارنة. التحويل إلى هللات (× 100) يحدث عند نداء Moyasar فقط.
--
-- الترحيل idempotent — يُعاد تشغيله بلا أثر.
-- ============================================================================

alter table public.inspections
  add column if not exists payment_status         text not null default 'unpaid',
  add column if not exists payment_id             text,
  add column if not exists payment_amount         numeric(10, 2),
  add column if not exists payment_currency       text not null default 'SAR',
  add column if not exists payment_method         text,
  add column if not exists payment_failure_reason text,
  add column if not exists paid_at                timestamptz;

-- قيود النطاق. `add constraint` لا تدعم `if not exists` في PostgreSQL،
-- فتُسوَّر بـDO على pg_constraint لتظلّ إعادة التشغيل آمنة.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_payment_status_check'
  ) then
    alter table public.inspections
      add constraint inspections_payment_status_check
      check (payment_status in ('unpaid', 'initiated', 'paid', 'failed', 'refunded', 'voided'));
  end if;

  -- مبلغ سالب لا معنى له. NULL مسموح لأنه يعني «لا محاولة دفع بعد».
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_payment_amount_range'
  ) then
    alter table public.inspections
      add constraint inspections_payment_amount_range
      check (payment_amount is null or payment_amount >= 0);
  end if;

  -- `paid` بلا مبلغ أو بلا وقت دفع صفٌّ متناقض: الواجهة تعرض «مدفوع» ثم لا
  -- تجد ما تعرضه. القيد يمنع الحالة النصفية من الأساس.
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_paid_requires_amount'
  ) then
    alter table public.inspections
      add constraint inspections_paid_requires_amount
      check (
        payment_status <> 'paid'
        or (payment_amount is not null and paid_at is not null)
      );
  end if;
end;
$$;

-- الـWebhook يصل بالمعرّف وحده ⇒ البحث به يجب أن يعيد صفًّا واحدًا على الأكثر.
create unique index if not exists inspections_payment_id_key
  on public.inspections (payment_id)
  where payment_id is not null;

-- لوحة الإدارة ترشّح بالحالة والدفع معًا (مثل: «مكتمل وغير مدفوع»).
create index if not exists inspections_payment_status_idx
  on public.inspections (payment_status, created_at desc);

-- ============================================================================
-- الدالة: تسوية الدفع
-- ----------------------------------------------------------------------------
-- سبب وجودها في القاعدة وليس في Node: التسوية قرار «أول كاتب يفوز» على صف
-- واحد. قراءة الحالة في Node ثم الكتابة = سباق مفتوح بين الـWebhook وصفحة
-- العودة (`callback_url`) — كلاهما يصل لنفس الدفعة، وقد يتداخلان فيسجّل
-- `failed` بعد `paid` أو العكس. هنا القفل والفحص والكتابة داخل معاملة واحدة.
--
-- القاعدة الحاكمة: **`paid` نهائية**. لا تُنقَل حالة صفٍّ مدفوع إلى `failed`
-- أو `initiated` أبدًا، مهما وصل من إشعارات متأخرة أو مكرّرة. أما `refunded`
-- و`voided` فمسموح بهما لأنهما تغيّران حقيقيان بعد الدفع.
--
-- تُعيد سطرًا واحدًا: `{ status, previousStatus, changed }`
--   status = 'ok' | 'not_found' | 'already_paid' | 'amount_mismatch' | 'no_accepted_offer'
--
-- المبلغ المتوقّع يُقرأ من **سعر العرض المقبول** (`inspection_offers.price`)
-- لا من قيمة يرسلها المتصفح ولا من عمود مخزَّن، لأن إعدادات نموذج الدفع تُبنى
-- في المتصفح وقابلة للعبث. التفصيل عند موضع الفحص أدناه.
-- ============================================================================

create or replace function public.settle_inspection_payment(
  p_payment_id     text,
  p_payment_status text,
  p_amount         numeric,
  p_currency       text,
  p_method         text,
  p_failure_reason text,
  p_paid_at        timestamptz,
  p_inspection_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target          public.inspections%rowtype;
  next_status     text := p_payment_status;
  prev_status     text;
  expected_amount numeric(10, 2);
begin
  -- المطابقة بالمعرّف أولًا (المسار الطبيعي)، ثم بمعرّف الطلب الوارد في
  -- metadata الدفعة. الثاني هو شبكة الأمان: لو فُقد `callback_url` أو وصل
  -- الإشعار قبل أن يُكتب `payment_id` في الصف، يبقى للدفعة مسار إلى طلبها.
  select * into target
    from public.inspections
    where (p_payment_id is not null and payment_id = p_payment_id)
       or (p_inspection_id is not null and id = p_inspection_id)
    order by (payment_id = p_payment_id) desc nulls last
    limit 1
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  prev_status := target.payment_status;

  -- الحماية الأهم: لا تراجع عن `paid`.
  if prev_status = 'paid' and next_status not in ('refunded', 'voided') then
    return jsonb_build_object(
      'status', 'already_paid',
      'previousStatus', prev_status,
      'changed', false
    );
  end if;

  -- ── التحقق من المبلغ عند أول تسوية ناجحة فقط ──────────────────────────────
  --
  -- المرجع ليس قيمة مخزّنة في الصف، بل **سعر العرض المقبول** المقروء الآن من
  -- `inspection_offers`. السبب: إعدادات نموذج Moyasar تُبنى في المتصفح، فيمكن
  -- لعميل عبث بها أن يدفع ريالًا واحدًا. المبلغ الوحيد الذي نثق به هو الذي
  -- اتّفق عليه الطرفان في القاعدة.
  --
  -- غياب عرض مقبول = لا مرجع = لا يجوز وسم الطلب مدفوعًا. الرفض هنا مقصود:
  -- الدفع يجري على سعر عرض مقبول، لا على طلب مفتوح بلا سعر متّفق عليه.
  if next_status = 'paid' and prev_status <> 'paid' then
    select o.price into expected_amount
      from public.inspection_offers o
      where o.id = target.accepted_offer_id;

    if expected_amount is null then
      return jsonb_build_object(
        'status', 'no_accepted_offer',
        'previousStatus', prev_status,
        'inspectionId', target.id
      );
    end if;

    if p_amount is null or p_amount <> expected_amount then
      return jsonb_build_object(
        'status', 'amount_mismatch',
        'previousStatus', prev_status,
        'expected', expected_amount,
        'received', p_amount
      );
    end if;

    if p_currency is not null and upper(p_currency) <> upper(target.payment_currency) then
      return jsonb_build_object(
        'status', 'amount_mismatch',
        'previousStatus', prev_status,
        'expected', target.payment_currency,
        'received', p_currency
      );
    end if;
  end if;

  -- `p_*` قيم اختيارية: لا تُمسح قيمة موجودة بقيمة غائبة.
  update public.inspections
    set payment_status = next_status,
        payment_id = coalesce(p_payment_id, payment_id),
        payment_amount = coalesce(p_amount, payment_amount),
        payment_currency = coalesce(upper(p_currency), payment_currency),
        payment_method = coalesce(p_method, payment_method),
        payment_failure_reason = case
          when next_status = 'failed' then coalesce(p_failure_reason, payment_failure_reason)
          when next_status = 'paid' then null
          else payment_failure_reason
        end,
        paid_at = case
          when next_status = 'paid' then coalesce(p_paid_at, paid_at, now())
          else paid_at
        end
    where id = target.id;

  return jsonb_build_object(
    'status', 'ok',
    'previousStatus', prev_status,
    'changed', prev_status is distinct from next_status,
    'inspectionId', target.id
  );
end;
$$;

do $$
begin
  if to_regprocedure(
    'public.settle_inspection_payment(text, text, numeric, text, text, text, timestamptz, text)'
  ) is null then
    return;
  end if;

  revoke all on function public.settle_inspection_payment(
    text, text, numeric, text, text, text, timestamptz, text
  ) from public, anon, authenticated;

  grant execute on function public.settle_inspection_payment(
    text, text, numeric, text, text, text, timestamptz, text
  ) to service_role;
end;
$$;

-- ============================================================================
-- تحقّق
-- ============================================================================
do $$
declare
  n_cols integer;
begin
  select count(*) into n_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inspections'
      and column_name in (
        'payment_status', 'payment_id', 'payment_amount', 'payment_currency',
        'payment_method', 'payment_failure_reason', 'paid_at'
      );

  if n_cols <> 7 then
    raise exception 'Moyasar payment migration incomplete: expected 7 columns, found %', n_cols;
  end if;

  raise notice 'Moyasar payment columns ready (%/7)', n_cols;
end;
$$;
