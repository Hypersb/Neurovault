'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Mic, FileArchive, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { BrainSelector } from '@/components/brain/BrainSelector'
import { createClient } from '@/lib/supabase/client'
import type { TrainingJob } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  retrying: 'Retrying',
  parsing: 'Parsing',
  embedding: 'Embedding',
  extracting: 'Entity Extraction',
  'graph-update': 'Graph Update',
  completed: 'Completed',
  failed: 'Failed',
}

const MAX_FILE_SIZE_BYTES: Record<string, number> = {
  pdf: 15 * 1024 * 1024,
  docx: 15 * 1024 * 1024,
  txt: 2 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
}

function JobCard({ job }: { job: TrainingJob }) {
  const isRunning = !['completed', 'failed'].includes(job.status)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {job.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : job.status === 'failed' ? (
              <XCircle className="h-4 w-4 text-red-500" />
            ) : job.status === 'retrying' ? (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--muted-foreground))]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{job.fileName}</p>
              <Badge
                variant={
                  job.status === 'completed'
                    ? 'success'
                    : job.status === 'failed'
                    ? 'destructive'
                    : 'secondary'
                }
                className="shrink-0"
              >
                {STATUS_LABELS[job.status] ?? job.status}
              </Badge>
            </div>

            {isRunning && (
              <div className="mt-2">
                <Progress value={job.progress * 100} className="h-1" />
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {STATUS_LABELS[job.status]}...
                  {job.totalChunks > 0 &&
                    ` ${job.chunksProcessed}/${job.totalChunks} chunks`}
                </p>
              </div>
            )}

            {job.status === 'completed' && (
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                {job.memoryCreated} memories · {job.conceptsExtracted} concepts extracted
              </p>
            )}

            {job.status === 'failed' && job.errorMessage && (
              <p className="mt-1 text-xs text-red-500">{job.errorMessage}</p>
            )}

            {(job.status === 'retrying' || job.status === 'failed') && (
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Attempt {job.attemptCount} of {job.maxAttempts}
              </p>
            )}

            {job.status === 'retrying' && (
              <p className="mt-1 text-xs text-amber-500">
                Will retry shortly
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function TrainPage() {
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const qc = useQueryClient()
  const supabase = createClient()

  const { data: jobs = [] } = useQuery<TrainingJob[]>({
    queryKey: ['training-jobs', selectedBrainId],
    queryFn: async () => {
      if (!selectedBrainId) return []
      const res = await fetch(`/api/train/${selectedBrainId}/jobs`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!selectedBrainId,
    refetchInterval: (query) => {
      const jobs = query.state.data as TrainingJob[] | undefined
      const hasRunning = jobs?.some((j) => !['completed', 'failed'].includes(j.status))
      return hasRunning ? 2000 : false
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedBrainId) throw new Error('No brain selected')

      // Determine file type
      const ext = file.name.split('.').pop()?.toLowerCase()
      const typeMap: Record<string, string> = {
        pdf: 'pdf',
        docx: 'docx',
        doc: 'docx',
        txt: 'txt',
        mp3: 'audio',
        mp4: 'audio',
        wav: 'audio',
        m4a: 'audio',
      }
      const fileType = typeMap[ext ?? '']
      if (!fileType) throw new Error(`Unsupported file type: .${ext}`)

      const maxBytes = MAX_FILE_SIZE_BYTES[fileType]
      if (!maxBytes || file.size > maxBytes) {
        throw new Error(`File too large for type ${fileType}`)
      }

      // Upload to Supabase Storage
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${selectedBrainId}/${Date.now()}-${safeFileName}`
      const { data: upload, error } = await supabase.storage
        .from('training-files')
        .upload(path, file)

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('training-files')
        .getPublicUrl(path)

      const idempotencyKey = `${selectedBrainId}:${file.name}:${file.size}:${file.lastModified}:${path}`

      // Create training job
      const res = await fetch(`/api/train/${selectedBrainId}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType,
          fileUrl: publicUrl,
          idempotencyKey,
        }),
      })

      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data as TrainingJob
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-jobs', selectedBrainId] })
    },
  })

  function handleFiles(files: FileList | File[]) {
    if (!selectedBrainId) return
    Array.from(files).forEach((f) => uploadMutation.mutate(f))
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Train Your AI</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Upload documents to build knowledge and personality
          </p>
        </div>
        <BrainSelector selectedBrainId={selectedBrainId} onSelect={setSelectedBrainId} />
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative rounded-xl border-2 border-dashed transition-colors ${
          dragging
            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--accent))]'
            : 'border-[hsl(var(--border))]'
        } ${!selectedBrainId ? 'opacity-50 pointer-events-none' : ''} mb-6`}
      >
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Upload className="h-10 w-10 text-[hsl(var(--muted-foreground))] mb-3" />
          <p className="text-sm font-medium mb-1">
            Drop files here or{' '}
            <label className="cursor-pointer text-[hsl(var(--primary))] hover:underline">
              browse
              <input
                type="file"
                className="sr-only"
                multiple
                accept=".pdf,.docx,.doc,.txt,.mp3,.mp4,.wav,.m4a"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            PDF, DOCX, TXT, MP3, MP4, WAV, M4A
          </p>
        </div>
      </div>

      {/* Supported types */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { icon: FileText, label: 'PDF Documents', ext: '.pdf' },
          { icon: FileArchive, label: 'Word Documents', ext: '.docx' },
          { icon: FileText, label: 'Text Files', ext: '.txt' },
          { icon: Mic, label: 'Audio Files', ext: '.mp3/.wav' },
        ].map(({ icon: Icon, label, ext }) => (
          <Card key={ext} className="border-dashed">
            <CardContent className="flex items-center gap-2 p-3">
              <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <div>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{ext}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Jobs */}
      {jobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-[hsl(var(--muted-foreground))]">
            Training Jobs
          </h2>
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
