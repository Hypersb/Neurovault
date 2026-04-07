'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, Trash2, Tag, Calendar, TrendingUp, Database } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BrainSelector } from '@/components/brain/BrainSelector'
import { formatRelativeTime, truncate } from '@/lib/utils'
import type { Memory } from '@/types'

function MemoryCard({
  memory,
  onDelete,
}: {
  memory: Memory
  onDelete: (id: string) => void
}) {
  const confidenceColor: 'success' | 'warning' | 'destructive' =
    memory.confidenceScore >= 0.7
      ? 'success'
      : memory.confidenceScore >= 0.4
      ? 'warning'
      : 'destructive'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      layout
    >
      <Card className="hover:border-[hsl(var(--muted-foreground)/30)] transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-relaxed">{truncate(memory.content, 300)}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={confidenceColor} className="text-xs">
                  {Math.round(memory.confidenceScore * 100)}% confidence
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {memory.sourceType}
                </Badge>

                {memory.metadataTags
                  .filter((t) => !['reflection', 'auto-extracted'].includes(t))
                  .slice(0, 3)
                  .map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      <Tag className="h-2.5 w-2.5 mr-1" />
                      {truncate(tag, 20)}
                    </Badge>
                  ))}

                <span className="text-xs text-[hsl(var(--muted-foreground))] ml-auto">
                  {formatRelativeTime(memory.createdAt)}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Used {memory.usageCount}x
                </span>
                {memory.lastAccessed && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Last: {formatRelativeTime(memory.lastAccessed)}
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-[hsl(var(--muted-foreground))] hover:text-red-500"
              onClick={() => onDelete(memory.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default function MemoryPage() {
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const url = selectedBrainId
    ? `/api/memory/${selectedBrainId}${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : `?page=${page}&pageSize=20`}`
    : null

  const { data: rawData, isLoading } = useQuery<{
    data?: {
      memories?: Memory[]
      total?: number
      hasMore?: boolean
    } | Memory[]
  }>({
    queryKey: ['memories', selectedBrainId, searchQuery, page],
    queryFn: async () => {
      const res = await fetch(url!)
      return res.json()
    },
    enabled: !!url,
  })

  const responseData = rawData?.data
  const memories: Memory[] = Array.isArray(responseData)
    ? responseData
    : (responseData as { memories?: Memory[] })?.memories ?? []
  const total: number = Array.isArray(responseData)
    ? memories.length
    : (responseData as { total?: number })?.total ?? memories.length
  const hasMore: boolean = Array.isArray(responseData)
    ? false
    : (responseData as { hasMore?: boolean })?.hasMore ?? false

  const deleteMutation = useMutation({
    mutationFn: async (memoryId: string) => {
      await fetch(`/api/memory/${selectedBrainId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memoryId }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories', selectedBrainId] })
    },
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Memory Explorer</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Browse and manage long-term memories
          </p>
        </div>
        <BrainSelector selectedBrainId={selectedBrainId} onSelect={setSelectedBrainId} />
      </div>

      {/* Search + stats */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
            className="pl-9"
            disabled={!selectedBrainId}
          />
        </div>
        {total > 0 && (
          <span className="text-sm text-[hsl(var(--muted-foreground))] whitespace-nowrap">
            <Database className="inline h-3.5 w-3.5 mr-1" />
            {total} {total === 1 ? 'memory' : 'memories'}
          </span>
        )}
      </div>

      {/* Memory list */}
      {!selectedBrainId ? (
        <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-[hsl(var(--border))]">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Select a brain to explore its memories
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-[hsl(var(--secondary))] animate-pulse" />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-[hsl(var(--border))]">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {searchQuery ? 'No memories found for that query' : 'No memories yet. Train your brain first.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {memories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>

          {!searchQuery && (
            <div className="flex justify-between items-center mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-sm text-[hsl(var(--muted-foreground))]">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
