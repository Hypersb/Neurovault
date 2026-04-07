import { env } from '@/lib/config/env-server'

const ALLOWED_EXTENSIONS_BY_TYPE: Record<string, string[]> = {
  pdf: ['pdf'],
  docx: ['docx', 'doc'],
  txt: ['txt'],
  audio: ['mp3', 'wav', 'm4a', 'mp4'],
}

const ALLOWED_CONTENT_TYPES_BY_TYPE: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  txt: ['text/plain'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'video/mp4', 'audio/x-m4a'],
}

const MAX_FILE_SIZE_BYTES_BY_TYPE: Record<string, number> = {
  pdf: 15 * 1024 * 1024,
  docx: 15 * 1024 * 1024,
  txt: 2 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

function normalizeBaseUrl(raw: string): string {
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

function isAllowedTrainingUrl(fileUrl: URL, expectedBrainId: string): boolean {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL

  const normalizedSupabaseUrl = normalizeBaseUrl(supabaseUrl)
  if (fileUrl.origin !== normalizedSupabaseUrl) return false

  return fileUrl.pathname.startsWith(
    `/storage/v1/object/public/training-files/${expectedBrainId}/`
  )
}

function parseFileSizeFromHeaders(headers: Headers): number | null {
  const contentLength = headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength)) {
    return Number(contentLength)
  }

  const contentRange = headers.get('content-range')
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/)
    if (match) return Number(match[1])
  }

  return null
}

async function fetchFileMetadata(fileUrl: string): Promise<{ sizeBytes: number | null; contentType: string | null }> {
  const headResponse = await fetch(fileUrl, { method: 'HEAD' })

  if (headResponse.ok) {
    return {
      sizeBytes: parseFileSizeFromHeaders(headResponse.headers),
      contentType: headResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? null,
    }
  }

  const rangeResponse = await fetch(fileUrl, {
    method: 'GET',
    headers: { Range: 'bytes=0-0' },
  })

  if (!rangeResponse.ok && rangeResponse.status !== 206) {
    return { sizeBytes: null, contentType: null }
  }

  return {
    sizeBytes: parseFileSizeFromHeaders(rangeResponse.headers),
    contentType: rangeResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? null,
  }
}

export async function validateTrainingUpload(params: {
  brainId: string
  fileName: string
  fileType: string
  fileUrl: string
}): Promise<{ valid: true } | { valid: false; reason: string }> {
  const fileName = params.fileName.trim()

  if (!fileName || fileName.length > 500) {
    return { valid: false, reason: 'Invalid file name' }
  }

  const extension = getFileExtension(fileName)
  const allowedExtensions = ALLOWED_EXTENSIONS_BY_TYPE[params.fileType] ?? []
  if (!extension || !allowedExtensions.includes(extension)) {
    return { valid: false, reason: 'Unsupported file extension for the selected file type' }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(params.fileUrl)
  } catch {
    return { valid: false, reason: 'Invalid file URL' }
  }

  if (parsedUrl.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTPS file URLs are allowed' }
  }

  if (!isAllowedTrainingUrl(parsedUrl, params.brainId)) {
    return { valid: false, reason: 'File URL must be in the training-files storage bucket' }
  }

  const metadata = await fetchFileMetadata(parsedUrl.toString())
  const maxFileSize = MAX_FILE_SIZE_BYTES_BY_TYPE[params.fileType] ?? 0

  if (!metadata.sizeBytes || Number.isNaN(metadata.sizeBytes)) {
    return { valid: false, reason: 'Unable to verify uploaded file size' }
  }

  if (metadata.sizeBytes <= 0 || metadata.sizeBytes > maxFileSize) {
    return { valid: false, reason: 'File is too large for the selected type' }
  }

  if (metadata.contentType) {
    const allowedContentTypes = ALLOWED_CONTENT_TYPES_BY_TYPE[params.fileType] ?? []
    if (!allowedContentTypes.includes(metadata.contentType)) {
      return { valid: false, reason: 'Uploaded file content type is not allowed' }
    }
  }

  return { valid: true }
}

export const TRAINING_UPLOAD_LIMITS_MB = {
  pdf: 15,
  docx: 15,
  txt: 2,
  audio: 100,
} as const
