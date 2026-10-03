import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'
import { expectedChecklistKeys, inspectionPhotoCategories, inspectionResultOptions } from '@/lib/inspection-report'
import { randomId } from '@/lib/web-crypto'
import { hasPdfSignature, inspectionMediaTypeForMime } from '@/lib/inspection-media'

const mediaBucket = 'inspection-media'
export const maxInspectionMediaBytes = 10 * 1024 * 1024

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(`Supabase report operation failed: ${error.message}`)
}

function resultRecord(value: Json) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supabase returned an invalid report operation result')
  }
  return value
}

async function assignedInspection(inspectionId: string, inspectorId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .select('id,status,assigned_inspector_id')
    .eq('id', inspectionId)
    .maybeSingle()
  throwIfError(error)
  if (!data) return { error: 'not_found' as const }
  if (data.assigned_inspector_id !== inspectorId) return { error: 'forbidden' as const }
  return { inspection: data }
}

export async function advanceInspectionStatus(input: {
  inspectionId: string
  inspectorId: string
  nextStatus: 'on_the_way' | 'arrived' | 'inspecting'
}) {
  const { data, error } = await getSupabaseAdmin().rpc('advance_inspection_status', {
    p_inspection_id: input.inspectionId,
    p_inspector_id: input.inspectorId,
    p_next_status: input.nextStatus,
  })
  throwIfError(error)
  const result = resultRecord(data)
  return typeof result.status === 'string' ? result.status : 'unknown'
}

export async function saveInspectionReport(input: {
  inspectionId: string
  inspectorId: string
  checklist: Record<string, string>
  notes: string
  submit: boolean
}) {
  const { data, error } = await getSupabaseAdmin().rpc('save_inspection_report', {
    p_inspection_id: input.inspectionId,
    p_inspector_id: input.inspectorId,
    p_checklist: input.checklist,
    p_notes: input.notes,
    p_submit: input.submit,
    p_expected_keys: expectedChecklistKeys,
    p_allowed_values: [...inspectionResultOptions],
  })
  throwIfError(error)
  const result = resultRecord(data)
  return typeof result.status === 'string' ? result.status : 'unknown'
}

export async function getInspectionReport(input: {
  inspectionId: string
  requesterId: string
  role: 'customer' | 'inspector'
}) {
  const { data: inspection, error: inspectionError } = await getSupabaseAdmin()
    .from('inspections')
    .select('customer_id,assigned_inspector_id')
    .eq('id', input.inspectionId)
    .maybeSingle()
  throwIfError(inspectionError)
  if (!inspection) return null
  const authorized = input.role === 'customer'
    ? inspection.customer_id === input.requesterId
    : inspection.assigned_inspector_id === input.requesterId
  if (!authorized) return null

  const { data: report, error: reportError } = await getSupabaseAdmin()
    .from('inspection_reports')
    .select('*')
    .eq('inspection_id', input.inspectionId)
    .maybeSingle()
  throwIfError(reportError)
  if (!report) {
    return input.role === 'inspector'
      ? {
          inspectionId: input.inspectionId,
          checklist: {},
          notes: '',
          submittedAt: null,
          updatedAt: null,
          media: [],
        }
      : null
  }
  if (input.role === 'customer' && !report.submitted_at) return null

  const { data: media, error: mediaError } = await getSupabaseAdmin()
    .from('inspection_media')
    .select('*')
    .eq('inspection_id', input.inspectionId)
    .order('created_at', { ascending: true })
  throwIfError(mediaError)

  const files = await Promise.all((media ?? []).map(async (item) => {
    const { data, error } = await getSupabaseAdmin()
      .storage
      .from(mediaBucket)
      .createSignedUrl(item.object_path, 5 * 60)
    throwIfError(error)
    if (!data?.signedUrl) throw new Error('Supabase did not return a signed inspection-media URL')
    return {
      id: item.id,
      type: item.media_type,
      mimeType: item.mime_type,
      category: item.category,
      fileName: item.original_filename,
      createdAt: item.created_at,
      url: data.signedUrl,
    }
  }))

  return {
    inspectionId: input.inspectionId,
    checklist: report.checklist,
    notes: report.notes,
    submittedAt: report.submitted_at,
    updatedAt: report.updated_at,
    media: files,
  }
}

export async function uploadInspectionMedia(input: {
  inspectionId: string
  inspectorId: string
  file: File
  category: string
}) {
  const assigned = await assignedInspection(input.inspectionId, input.inspectorId)
  if ('error' in assigned) return assigned
  if (assigned.inspection.status === 'completed' || assigned.inspection.status === 'cancelled') {
    return { error: 'closed' as const }
  }

  const mediaType = inspectionMediaTypeForMime(input.file.type)
  if (!mediaType || input.file.size <= 0 || input.file.size > maxInspectionMediaBytes) {
    return { error: 'invalid_file' as const }
  }
  if (mediaType.kind === 'document') {
    const signature = new Uint8Array(await input.file.slice(0, 5).arrayBuffer())
    if (!hasPdfSignature(signature)) return { error: 'invalid_file' as const }
  }
  if (!(inspectionPhotoCategories as readonly string[]).includes(input.category)) {
    return { error: 'invalid_category' as const }
  }

  const objectPath = `${input.inspectionId}/${input.inspectorId}/${randomId()}.${mediaType.extension}`
  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage
    .from(mediaBucket)
    .upload(objectPath, input.file, { contentType: input.file.type, upsert: false })
  throwIfError(uploadError)

  const { data, error: insertError } = await supabase
    .from('inspection_media')
    .insert({
      inspection_id: input.inspectionId,
      inspector_id: input.inspectorId,
      object_path: objectPath,
      media_type: mediaType.kind,
      mime_type: input.file.type,
      file_size: input.file.size,
      category: input.category,
      original_filename: input.file.name
        .replace(/[\\/]/g, '_')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 120) || 'مرفق',
    })
    .select('id')
    .single()
  if (insertError) {
    const { error: cleanupError } = await supabase.storage.from(mediaBucket).remove([objectPath])
    if (cleanupError) {
      throw new Error(`Media metadata persistence failed and uploaded object cleanup failed: ${insertError.message}; ${cleanupError.message}`)
    }
    throw new Error(`Supabase report operation failed: ${insertError.message}`)
  }
  if (!data) throw new Error('Supabase did not return the uploaded media record')
  return { id: data.id, type: mediaType.kind, category: input.category }
}

export async function deleteInspectionMedia(input: {
  inspectionId: string
  inspectorId: string
  mediaId: string
}) {
  const assigned = await assignedInspection(input.inspectionId, input.inspectorId)
  if ('error' in assigned) return assigned
  if (assigned.inspection.status === 'completed' || assigned.inspection.status === 'cancelled') {
    return { error: 'closed' as const }
  }

  const supabase = getSupabaseAdmin()
  const { data: media, error: readError } = await supabase
    .from('inspection_media')
    .select('id,object_path')
    .eq('id', input.mediaId)
    .eq('inspection_id', input.inspectionId)
    .eq('inspector_id', input.inspectorId)
    .maybeSingle()
  throwIfError(readError)
  if (!media) return { error: 'not_found' as const }

  const { error: removeError } = await supabase.storage.from(mediaBucket).remove([media.object_path])
  throwIfError(removeError)
  const { error: deleteError } = await supabase
    .from('inspection_media')
    .delete()
    .eq('id', media.id)
    .eq('inspector_id', input.inspectorId)
  throwIfError(deleteError)
  return { success: true as const }
}
