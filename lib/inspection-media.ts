import type { InspectionMediaType } from '@/types/inspection-report'

type AllowedInspectionMedia = {
  kind: InspectionMediaType
  extension: string
}

const allowedMediaTypes: ReadonlyMap<string, AllowedInspectionMedia> = new Map([
  ['image/jpeg', { kind: 'image', extension: 'jpg' }],
  ['image/png', { kind: 'image', extension: 'png' }],
  ['image/webp', { kind: 'image', extension: 'webp' }],
  ['image/heic', { kind: 'image', extension: 'heic' }],
  ['video/mp4', { kind: 'video', extension: 'mp4' }],
  ['video/quicktime', { kind: 'video', extension: 'mov' }],
  ['application/pdf', { kind: 'document', extension: 'pdf' }],
])

export function inspectionMediaTypeForMime(mimeType: string): AllowedInspectionMedia | null {
  return allowedMediaTypes.get(mimeType) ?? null
}

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
}
