'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BrainSelector } from '@/components/brain/BrainSelector'
import { Shield, Trash2, Lock, BookOpen, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Brain } from '@/types'

export default function SettingsPage() {
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [deletingBrain, setDeletingBrain] = useState(false)
  const qc = useQueryClient()
  const router = useRouter()
  const supabase = createClient()

  const { data: brain } = useQuery<Brain>({
    queryKey: ['brain', selectedBrainId],
    queryFn: async () => {
      const res = await fetch(`/api/brains/${selectedBrainId}`)
      return res.json().then((j) => j.data)
    },
    enabled: !!selectedBrainId,
  })

  const toggleLegacyMutation = useMutation({
    mutationFn: async (isLegacy: boolean) => {
      await fetch(`/api/brains/${selectedBrainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLegacy }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brain', selectedBrainId] }),
  })

  async function handleDeleteBrain() {
    if (!selectedBrainId || confirmDelete !== brain?.name) return
    setDeletingBrain(true)
    try {
      await fetch(`/api/brains/${selectedBrainId}`, { method: 'DELETE' })
      qc.invalidateQueries({ queryKey: ['brains'] })
      setSelectedBrainId(null)
      setConfirmDelete('')
    } finally {
      setDeletingBrain(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Brain configuration and account
          </p>
        </div>
        <BrainSelector selectedBrainId={selectedBrainId} onSelect={setSelectedBrainId} />
      </div>

      <div className="space-y-4">
        {/* Security info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <CardTitle className="text-base">Security</CardTitle>
            </div>
            <CardDescription>How your data is protected</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              All memories are encrypted with AES-256-GCM before storage
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              Personality profiles are encrypted at rest
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              Row-level security enforced — only you can read your brains
            </div>
          </CardContent>
        </Card>

        {/* Legacy mode */}
        {selectedBrainId && brain && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                <CardTitle className="text-base">Legacy Mode</CardTitle>
              </div>
              <CardDescription>
                Freeze this brain in read-only state. No new training or memory writes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={brain.isLegacy ? 'warning' : 'secondary'}>
                    {brain.isLegacy ? 'Legacy (Read-Only)' : 'Active'}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleLegacyMutation.mutate(!brain.isLegacy)}
                  disabled={toggleLegacyMutation.isPending}
                >
                  {brain.isLegacy ? 'Reactivate Brain' : 'Enable Legacy Mode'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delete brain */}
        {selectedBrainId && brain && (
          <Card className="border-red-500/30">
            <CardHeader>
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-4 w-4" />
                <CardTitle className="text-base text-red-500">Danger Zone</CardTitle>
              </div>
              <CardDescription>
                Permanently delete this brain. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Type <span className="font-mono font-medium text-[hsl(var(--foreground))]">{brain.name}</span> to confirm deletion
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder={brain.name}
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteBrain}
                  disabled={confirmDelete !== brain.name || deletingBrain}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Brain
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
