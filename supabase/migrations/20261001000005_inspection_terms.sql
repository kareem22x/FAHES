-- ============================================================================
-- 05 — شروط الفحص + وسائط PDF
-- ----------------------------------------------------------------------------
-- يضيف إقرار الشروط إلى الفحص، ويوسّع أنواع الوسائط لتقبل المستندات (PDF)،
-- ويحدّث قائمة الأنواع المسموحة في مخزن الوسائط.
--
-- مبنيّ idempotent بالكامل: كان الملف الأصلي يفشل على قاعدة تحتوي بعض الأعمدة
-- (`add column` بلا `if not exists`، و`drop constraint` بلا `if exists`).
-- ============================================================================

alter table public.inspections
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

-- الإقرار يجب أن يكون كاملًا أو غائبًا تمامًا.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_terms_consent_pair_check'
  ) then
    alter table public.inspections
      add constraint inspections_terms_consent_pair_check
      check ((terms_version is null) = (terms_accepted_at is null));
  end if;
end;
$$;

alter table public.inspection_media
  add column if not exists original_filename text not null default '';

-- قيد نوع الوسائط: نسقطه ثم نعيد إنشاءه بالنسخة الموسَّعة.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'inspection_media_media_type_check'
       and conrelid = 'public.inspection_media'::regclass
  ) then
    alter table public.inspection_media drop constraint inspection_media_media_type_check;
  end if;
  alter table public.inspection_media
    add constraint inspection_media_media_type_check
    check (media_type in ('image', 'video', 'document'));
exception
  when duplicate_object then null;
end;
$$;

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'application/pdf'
]
where id = 'inspection-media';
