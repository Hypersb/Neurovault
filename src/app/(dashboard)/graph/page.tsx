'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ReactFlow, {
  Node,
  Edge,
  Connection,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { BrainSelector } from '@/components/brain/BrainSelector'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { KnowledgeGraph, GraphNode } from '@/types'

function buildReactFlowGraph(graph: KnowledgeGraph): { nodes: Node[]; edges: Edge[] } {
  const nodeCount = graph.nodes.length
  const radius = Math.max(200, nodeCount * 30)

  const nodes: Node[] = graph.nodes.map((n, i) => {
    const angle = (i / nodeCount) * 2 * Math.PI
    const x = radius * Math.cos(angle)
    const y = radius * Math.sin(angle)

    const size = 40 + n.importanceScore * 40

    return {
      id: n.id,
      position: { x, y },
      data: { label: n.label, domain: n.domain, importance: n.importanceScore },
      style: {
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        fontWeight: '600',
        textAlign: 'center',
        padding: '4px',
        background: `hsl(${(i * 47) % 360} 60% 55%)`,
        color: 'white',
        border: '2px solid rgba(255,255,255,0.3)',
        overflow: 'hidden',
      },
      type: 'default',
    }
  })

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    style: { stroke: `rgba(150,150,150,${e.strength})`, strokeWidth: 1 + e.strength * 2 },
    labelStyle: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' },
    animated: e.strength > 0.8,
  }))

  return { nodes, edges }
}

export default function GraphPage() {
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const { data: graph } = useQuery<KnowledgeGraph>({
    queryKey: ['knowledge-graph', selectedBrainId],
    queryFn: async () => {
      const res = await fetch(`/api/graph/${selectedBrainId}`)
      const json = await res.json()
      return json.data
    },
    enabled: !!selectedBrainId,
    select: (data) => {
      const { nodes: rfNodes, edges: rfEdges } = buildReactFlowGraph(data)
      setNodes(rfNodes)
      setEdges(rfEdges)
      return data
    },
  })

  function onConnect(params: Connection) {
    setEdges((eds) => addEdge(params, eds))
  }

  function onNodeClick(_: React.MouseEvent, node: Node) {
    const graphNode = graph?.nodes.find((n) => n.id === node.id) ?? null
    setSelectedNode(graphNode)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Knowledge Graph</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Interactive view of concepts and relationships
          </p>
        </div>
        <BrainSelector selectedBrainId={selectedBrainId} onSelect={setSelectedBrainId} />
      </div>

      <div className="flex-1 relative">
        {!selectedBrainId ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Select a brain to explore its knowledge graph
            </p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No concepts yet. Train your brain to populate the graph.
            </p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
            <Controls />
            <MiniMap
              nodeColor={() => 'hsl(var(--primary))'}
              maskColor="rgba(0,0,0,0.4)"
            />
          </ReactFlow>
        )}

        {/* Selected node panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-64">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{selectedNode.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                {selectedNode.domain && (
                  <Badge variant="secondary">{selectedNode.domain}</Badge>
                )}
                <p className="text-[hsl(var(--muted-foreground))]">
                  Importance: {Math.round(selectedNode.importanceScore * 100)}%
                </p>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  Dismiss
                </button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
