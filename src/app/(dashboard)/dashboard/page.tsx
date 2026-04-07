'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Database, Network, Activity, BookOpen, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { BrainSelector } from '@/components/brain/BrainSelector'
import type { BrainHealthStats } from '@/types'

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  delay = 0,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
              {sub && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
            </div>
            <div className="rounded-md bg-[hsl(var(--accent))] p-2">
              <Icon className="h-4 w-4 text-[hsl(var(--accent-foreground))]" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default function DashboardPage() {
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)

  const { data: health } = useQuery<BrainHealthStats>({
    queryKey: ['brain-health', selectedBrainId],
    queryFn: async () => {
      if (!selectedBrainId) return null
      const res = await fetch(`/api/brains/${selectedBrainId}/health`)
      const json = await res.json()
      return json.data
    },
    enabled: !!selectedBrainId,
  })

  const avgConfidencePct = health ? Math.round(health.avgConfidence * 100) : 0

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Your AI brain at a glance
          </p>
        </div>
        <BrainSelector
          selectedBrainId={selectedBrainId}
          onSelect={setSelectedBrainId}
        />
      </div>

      {!selectedBrainId && (
        <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-[hsl(var(--border))]">
          <div className="text-center">
            <Brain className="h-10 w-10 mx-auto text-[hsl(var(--muted-foreground))] mb-3" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Select or create a brain to view its stats
            </p>
          </div>
        </div>
      )}

      {health && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <StatCard icon={Database} label="Memories" value={health.memoryCount} delay={0} />
            <StatCard icon={Network} label="Concepts" value={health.conceptCount} delay={0.05} />
            <StatCard
              icon={Activity}
              label="Relationships"
              value={health.relationshipCount}
              delay={0.1}
            />
            <StatCard
              icon={Zap}
              label="Avg Confidence"
              value={`${avgConfidencePct}%`}
              delay={0.15}
            />
            <StatCard
              icon={BookOpen}
              label="Training Jobs"
              value={health.trainingJobs.completed}
              sub={`${health.trainingJobs.inProgress} in progress`}
              delay={0.2}
            />
            <StatCard
              icon={Brain}
              label="Brain Version"
              value={`v${health.brainVersion}`}
              delay={0.25}
            />
          </div>

          {/* Confidence distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Confidence Distribution</CardTitle>
                <CardDescription>Memory confidence spread</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      label: 'High (≥ 70%)',
                      count: health.confidenceDistribution.high,
                      color: 'bg-emerald-500',
                    },
                    {
                      label: 'Medium (40–70%)',
                      count: health.confidenceDistribution.medium,
                      color: 'bg-amber-500',
                    },
                    {
                      label: 'Low (< 40%)',
                      count: health.confidenceDistribution.low,
                      color: 'bg-red-500',
                    },
                  ].map(({ label, count, color }) => {
                    const pct = health.memoryCount > 0 ? (count / health.memoryCount) * 100 : 0
                    return (
                      <div key={label}>
                        <div className="flex text-xs justify-between mb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[hsl(var(--secondary))] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${color}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top domains */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Knowledge Domains</CardTitle>
                <CardDescription>Most frequent concept categories</CardDescription>
              </CardHeader>
              <CardContent>
                {health.topDomains.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    No domains extracted yet. Train your brain to populate knowledge.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {health.topDomains.map((d) => (
                      <Badge key={d.domain} variant="secondary">
                        {d.domain} · {d.count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
