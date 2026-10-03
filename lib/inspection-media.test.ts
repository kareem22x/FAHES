import { describe, expect, it } from 'vitest'
import { hasPdfSignature, inspectionMediaTypeForMime } from '@/lib/inspection-media'

describe('inspection media validation', () => {
  it('allows only the supported image, video, and PDF MIME types', () => {
    expect(inspectionMediaTypeForMime('image/jpeg')?.kind).toBe('image')
    expect(inspectionMediaTypeForMime('video/mp4')?.kind).toBe('video')
    expect(inspectionMediaTypeForMime('application/pdf')?.kind).toBe('document')
    expect(inspectionMediaTypeForMime('application/zip')).toBeNull()
  })

  it('checks the PDF magic header rather than trusting the browser MIME value', () => {
    expect(hasPdfSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true)
    expect(hasPdfSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false)
    expect(hasPdfSignature(new Uint8Array([0x4d, 0x5a, 0, 0, 0]))).toBe(false)
  })
})
