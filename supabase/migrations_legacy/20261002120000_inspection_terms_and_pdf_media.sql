alter table public.inspections
  add column terms_version text,
  add column terms_accepted_at timestamptz;

alter table public.inspections
  add constraint inspections_terms_consent_pair_check
  check ((terms_version is null) = (terms_accepted_at is null));

alter table public.inspection_media
  add column original_filename text not null default '',
  drop constraint inspection_media_media_type_check,
  add constraint inspection_media_media_type_check
    check (media_type in ('image', 'video', 'document'));

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
