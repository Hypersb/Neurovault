'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Brain, Database, Network, Activity, GitBranch, Download, Archive } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { BrainSelector } from '@/components/brain/BrainSelector'
import { formatDate } from '@/lib/utils'
import type { BrainHealthStats, BrainSnapshot } from '@/types'

export default function HealthPage() {
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [creatingSnapshot, setCreatingSnapshot] = useState(false)

  const { data: stats, refetch: refetchStats } = useQuery<BrainHealthStats>({
    queryKey: ['brain-health', selectedBrainId],
    queryFn: async () => {
      const res = await fetch(`/api/brains/${selectedBrainId}/health`)
      const json = await res.json()
      return json.data
    },
    enabled: !!selectedBrainId,
  })

  const { data: snapshots = [], refetch: refetchSnapshots } = useQuery<BrainSnapshot[]>({
    queryKey: ['snapshots', selectedBrainId],
    queryFn: async () => {
      const res = await fetch(`/api/brains/${selectedBrainId}/snapshots`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!selectedBrainId,
  })

  async function handleCreateSnapshot() {
    if (!selectedBrainId) return
    setCreatingSnapshot(true)
    try {
      await fetch(`/api/brains/${selectedBrainId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: snapshotLabel || undefined }),
      })
      await refetchSnapshots()
      setSnapshotLabel('')
    } finally {
      setCreatingSnapshot(false)
    }
  }

  async function handleExport() {
    if (!selectedBrainId) return
    window.location.href = `/api/brains/${selectedBrainId}/export`
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Brain Health</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Detailed diagnostics and version management
          </p>
        </div>
        <BrainSelector selectedBrainId={selectedBrainId} onSelect={setSelectedBrainId} />
      </div>

      {!selectedBrainId ? (
        <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-[hsl(var(--border))]">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Select a brain to view health stats</p>
        </div>
      ) : stats && (
        <div className="space-y-4">
          {/* Overview cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Database, label: 'Memories', value: stats.memoryCount },
              { icon: Network, label: 'Concepts', value: stats.conceptCount },
              { icon: Activity, label: 'Relationships', value: stats.relationshipCount },
              { icon: GitBranch, label: 'Version', value: `v${stats.brainVersion}` },
            ].map(({ icon: Icon, label, value }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                    </div>
                    <p className="text-xl font-semibold">{value}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Avg confidence bar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Average Memory Confidence</CardTitle>
              <CardDescription>
                Higher confidence → more reliable memories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Progress value={stats.avgConfidence * 100} className="flex-1" />
                <span className="text-sm font-semibold">
                  {Math.round(stats.avgConfidence * 100)}%
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: 'High (≥70%)', value: stats.confidenceDistribution.high, color: 'text-emerald-500' },
                  { label: 'Medium', value: stats.confidenceDistribution.medium, color: 'text-amber-500' },
                  { label: 'Low (<40%)', value: stats.confidenceDistribution.low, color: 'text-red-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <p className={`text-lg font-semibold ${color}`}>{value}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Training status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Training Jobs</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-6">
              {([
                { label: 'Completed', value: stats.trainingJobs.completed, variant: 'success' },
                { label: 'In Progress', value: stats.trainingJobs.inProgress, variant: 'secondary' },
                { label: 'Failed', value: stats.trainingJobs.failed, variant: 'destructive' },
              ] as const).map(({ label, value, variant }) => (
                <div key={label} className="flex items-center gap-2">
                  <Badge variant={variant}>{value}</Badge>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Snapshots */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Brain Snapshots</CardTitle>
                  <CardDescription>Save full brain state for restore</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Snapshot label (optional)"
                    value={snapshotLabel}
                    onChange={(e) => setSnapshotLabel(e.target.value)}
                    className="h-8 rounded-md border border-[hsl(var(--input))] bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateSnapshot}
                    disabled={creatingSnapshot}
                  >
                    <Archive className="h-3.5 w-3.5 mr-1.5" />
                    {creatingSnapshot ? 'Saving...' : 'Save Snapshot'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {snapshots.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No snapshots yet.</p>
              ) : (
                <div className="space-y-2">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{snap.label ?? `Snapshot v${snap.version}`}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          v{snap.version} · {formatDate(snap.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Export */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export Brain (JSON)
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
