"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap,
  useNodesState, useEdgesState, BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { toPng } from "html-to-image";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Loader2, Search, Download, X, Maximize2 } from "lucide-react";
import { useBrainContext, useKnowledgeGraph, type Concept, type Relationship } from "@/lib/hooks";
import { PageError } from "@/components/ui/page-error";
import { toast } from "sonner";
import Link from "next/link";

const DOMAIN_COLORS: Record<string, string> = {
  "Machine Learning": "#7c5cfc",
  "Systems Design":   "#38bdf8",
  "Philosophy":       "#f59e0b",
  "Mathematics":      "#22c55e",
  "Programming":      "#ef4444",
  "Science":          "#ec4899",
  "History":          "#f97316",
  "General":          "#94a3b8",
};

function getDomainColor(domain: string | null): string {
  return DOMAIN_COLORS[domain || "General"] || DOMAIN_COLORS.General;
}

function layoutWithDagre(concepts: Concept[], relationships: Relationship[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100, marginx: 40, marginy: 40 });

  concepts.forEach((c) => {
    const size = 40 + (c.importance_score || 0.5) * 60;
    g.setNode(c.id, { width: size + 60, height: size });
  });

  relationships.forEach((r) => {
    if (g.hasNode(r.source_concept_id) && g.hasNode(r.target_concept_id)) {
      g.setEdge(r.source_concept_id, r.target_concept_id);
    }
  });

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  g.nodes().forEach((id) => {
    const node = g.node(id);
    if (node) {
      positions[id] = { x: node.x - (node.width || 100) / 2, y: node.y - (node.height || 60) / 2 };
    }
  });
  return positions;
}

export default function GraphPage() {
  const { activeBrainId } = useBrainContext();
  const { data, isLoading, error, refetch } = useKnowledgeGraph(activeBrainId);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeDomains, setActiveDomains] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<Concept | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);

  // Collect all domains from data
  const allDomains = data
    ? Array.from(new Set(data.concepts.map((c: Concept) => c.domain || "General")))
    : [];

  // Initialize active domains when data loads
  useEffect(() => {
    if (allDomains.length > 0 && activeDomains.size === 0) {
      setActiveDomains(new Set(allDomains));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Build nodes/edges whenever data, search, or domain filter changes
  useEffect(() => {
    if (!data) return;

    const positions = layoutWithDagre(data.concepts, data.relationships);

    // Filter concepts by active domains
    const filteredConcepts = data.concepts.filter(
      (c: Concept) => activeDomains.has(c.domain || "General")
    );
    const filteredIds = new Set(filteredConcepts.map((c: Concept) => c.id));

    const lowerSearch = searchTerm.toLowerCase().trim();

    const newNodes: Node[] = filteredConcepts.map((c: Concept) => {
      const color = getDomainColor(c.domain);
      const isMatch = lowerSearch && c.name.toLowerCase().includes(lowerSearch);
      const isDimmed = lowerSearch && !isMatch;
      const nodeSize = 40 + (c.importance_score || 0.5) * 60;

      return {
        id: c.id,
        position: positions[c.id] || { x: 0, y: 0 },
        data: {
          label: c.name,
          domain: c.domain || "General",
          description: c.description,
          importance: c.importance_score,
        },
        style: {
          background: isDimmed ? `${color}08` : `${color}22`,
          border: isMatch
            ? `2px solid ${color}`
            : `1px solid ${isDimmed ? `${color}15` : `${color}44`}`,
          borderRadius: "10px",
          padding: "8px 14px",
          fontSize: "11px",
          color: isDimmed ? "#64748b" : "#e2e8f0",
          fontWeight: isMatch ? 600 : 400,
          width: `${nodeSize + 60}px`,
          boxShadow: isMatch ? `0 0 16px ${color}40` : "none",
          transition: "all 0.3s ease",
          opacity: isDimmed ? 0.4 : 1,
        },
      };
    });

    const newEdges: Edge[] = data.relationships
      .filter(
        (r: Relationship) =>
          filteredIds.has(r.source_concept_id) && filteredIds.has(r.target_concept_id)
      )
      .map((r: Relationship) => ({
        id: r.id,
        source: r.source_concept_id,
        target: r.target_concept_id,
        label: r.relationship_type,
        type: "default",
        animated: true,
        style: { stroke: "#1e2333", strokeWidth: 1.5 },
        labelStyle: { fontSize: "9px", fill: "#64748b" },
      }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [data, activeDomains, searchTerm, setNodes, setEdges]);

  const toggleDomain = useCallback((domain: string) => {
    setActiveDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!data) return;
      const concept = data.concepts.find((c: Concept) => c.id === node.id);
      if (concept) setSelectedNode(concept);
    },
    [data]
  );

  const handleExportPng = useCallback(async () => {
    if (!graphRef.current) return;
    try {
      const dataUrl = await toPng(graphRef.current, {
        backgroundColor: "#0a0c14",
        quality: 1,
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `neurovault-graph-${Date.now()}.png`;
      a.click();
      toast.success("Graph exported as PNG");
    } catch {
      toast.error("Failed to export graph");
    }
  }, []);

  if (error) return <PageError message={error instanceof Error ? error.message : String(error)} onRetry={() => refetch()} />;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col h-screen relative">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0">
        <GitBranch className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Knowledge Graph</span>
        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
          {data?.concepts.length || 0} concepts
        </Badge>
        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
          {data?.relationships.length || 0} relationships
        </Badge>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search concepts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 w-48"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Export */}
        <button
          onClick={handleExportPng}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-card border border-border rounded-lg px-3 py-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          PNG
        </button>
      </div>

      {nodes.length === 0 && !searchTerm && activeDomains.size === allDomains.length ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <GitBranch className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">No concepts yet.</p>
            <p className="text-xs text-muted-foreground/60">
              Train your brain with documents to build the knowledge graph.
            </p>
            <Link
              href="/train"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Go to Training <Maximize2 className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative" ref={graphRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2333" />
            <Controls className="!bg-card !border-border" />
            <MiniMap
              nodeColor={(n) => getDomainColor((n.data as { domain: string }).domain)}
              maskColor="rgba(10,12,20,0.7)"
            />
          </ReactFlow>
        </div>
      )}

      {/* Domain filter legend */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-4 left-4 flex flex-wrap gap-1.5 z-10"
      >
        {allDomains.map((domain) => {
          const color = getDomainColor(domain);
          const isActive = activeDomains.has(domain);
          return (
            <button
              key={domain}
              onClick={() => toggleDomain(domain)}
              className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                isActive
                  ? "bg-card/80 backdrop-blur text-foreground border-border"
                  : "bg-card/30 text-muted-foreground/40 border-border/30 line-through"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full transition-opacity"
                style={{ background: color, opacity: isActive ? 1 : 0.3 }}
              />
              {domain}
            </button>
          );
        })}
      </motion.div>

      {/* Node detail panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 right-4 w-72 bg-card/95 backdrop-blur-xl border border-border rounded-xl p-4 z-20 shadow-xl"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">{selectedNode.name}</h3>
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] mt-1 px-2 py-0.5 rounded-full"
                  style={{
                    background: `${getDomainColor(selectedNode.domain)}20`,
                    color: getDomainColor(selectedNode.domain),
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: getDomainColor(selectedNode.domain) }}
                  />
                  {selectedNode.domain || "General"}
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedNode.description && (
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">{selectedNode.description}</p>
            )}

            {/* Importance bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Importance</span>
                <span className="text-foreground font-medium">{((selectedNode.importance_score || 0) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(selectedNode.importance_score || 0) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: getDomainColor(selectedNode.domain) }}
                />
              </div>
            </div>

            {/* Connections count */}
            {data && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground">
                  {data.relationships.filter(
                    (r: Relationship) => r.source_concept_id === selectedNode.id || r.target_concept_id === selectedNode.id
                  ).length}{" "}
                  connections
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
