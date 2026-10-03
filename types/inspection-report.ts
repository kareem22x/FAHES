export type InspectionMediaType = 'image' | 'video' | 'document'

export type InspectionReportMedia = {
  id: string
  type: InspectionMediaType
  mimeType: string
  category: string
  fileName: string
  createdAt: string
  url: string
}
