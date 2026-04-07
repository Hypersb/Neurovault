'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Brain, Plus, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Brain as BrainType } from '@/types'

interface Props {
  selectedBrainId: string | null
  onSelect: (brainId: string) => void
}

export function BrainSelector({ selectedBrainId, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const qc = useQueryClient()

  const { data: brains = [] } = useQuery<BrainType[]>({
    queryKey: ['brains'],
    queryFn: async () => {
      const res = await fetch('/api/brains')
      const json = await res.json()
      return json.data ?? []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/brains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      return json.data as BrainType
    },
    onSuccess: (brain) => {
      qc.invalidateQueries({ queryKey: ['brains'] })
      onSelect(brain.id)
      setCreating(false)
      setNewName('')
      setOpen(false)
    },
  })

  const selectedBrain = brains.find((b) => b.id === selectedBrainId)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm hover:bg-[hsl(var(--accent))] transition-colors min-w-[180px]"
      >
        <Brain className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <span className="flex-1 text-left truncate">
          {selectedBrain?.name ?? 'Select Brain'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-64 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg z-50 overflow-hidden">
          {brains.map((brain) => (
            <button
              key={brain.id}
              onClick={() => {
                onSelect(brain.id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-[hsl(var(--accent))] transition-colors"
            >
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="flex-1 text-left truncate">{brain.name}</span>
              {brain.isLegacy && (
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Legacy</span>
              )}
            </button>
          ))}

          <div className="border-t border-[hsl(var(--border))] p-2">
            {creating ? (
              <div className="flex gap-2">
                <Input
                  placeholder="Brain name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim()) {
                      createMutation.mutate(newName.trim())
                    }
                    if (e.key === 'Escape') setCreating(false)
                  }}
                  autoFocus
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
                  disabled={createMutation.isPending}
                  className="h-8 text-xs"
                >
                  Create
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                New Brain
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
