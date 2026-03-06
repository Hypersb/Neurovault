"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap,
  useNodesState, useEdgesState, BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Loader2 } from "lucide-react";
import { useBrainContext, useKnowledgeGraph, type Concept, type Relationship } from "@/lib/hooks";
import { PageError } from "@/components/ui/page-error";

const DOMAIN_COLORS: Record<string, string> = {
  "Machine Learning": "#7c5cfc",
  "Systems Design":   "#38bdf8",
  "Philosophy":       "#f59e0b",
  "Mathematics":      "#22c55e",
  "Programming":      "#ef4444",
  "General":          "#94a3b8",
};

export default function GraphPage() {
  const { activeBrainId } = useBrainContext();
  const { data, isLoading, error, refetch } = useKnowledgeGraph(activeBrainId);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes/edges whenever data changes
  useEffect(() => {
    if (!data) return;

    const newNodes: Node[] = data.concepts.map((c: Concept, i: number) => ({
      id: c.id,
      position: {
        x: 200 + Math.cos(i * 2.4) * (150 + i * 30),
        y: 200 + Math.sin(i * 2.4) * (150 + i * 30),
      },
      data: { label: c.name, domain: c.domain || "General", description: c.description, importance: c.importance_score },
      style: {
        background: `${DOMAIN_COLORS[c.domain || "General"] || DOMAIN_COLORS.General}22`,
        border: `1px solid ${DOMAIN_COLORS[c.domain || "General"] || DOMAIN_COLORS.General}44`,
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "11px",
        color: "#e2e8f0",
      },
    }));

    const newEdges: Edge[] = data.relationships.map((r: Relationship) => ({
      id: r.id,
      source: r.source_concept_id,
      target: r.target_concept_id,
      label: r.relationship_type,
      type: "default",
      style: { stroke: "#1e2333", strokeWidth: 1.5 },
      labelStyle: { fontSize: "9px", fill: "#64748b" },
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [data, setNodes, setEdges]);

  if (error) return <PageError message={error instanceof Error ? error.message : String(error)} onRetry={() => refetch()} />;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0">
        <GitBranch className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Knowledge Graph</span>
        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{nodes.length} concepts</Badge>
        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{edges.length} relationships</Badge>
      </div>

      {nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <GitBranch className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No concepts yet. Train your brain to build the knowledge graph.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2333" />
            <Controls className="!bg-card !border-border" />
            <MiniMap
              nodeColor={(n) => DOMAIN_COLORS[(n.data as { domain: string }).domain] ?? "#7c5cfc"}
              maskColor="rgba(10,12,20,0.7)"
            />
          </ReactFlow>
        </div>
      )}

      {/* Legend */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute bottom-4 left-4 flex flex-wrap gap-2 z-10">
        {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
          <span key={domain} className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-card/80 backdrop-blur px-2 py-1 rounded border border-border">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            {domain}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
