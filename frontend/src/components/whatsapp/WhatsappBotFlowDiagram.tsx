import "@xyflow/react/dist/style.css";
import { memo, useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import type { WhatsappBotFlow, WhatsappBotStep } from "../../api/whatsappBot";
import styles from "./WhatsappBotFlowDiagram.module.css";

function collectOutgoingKeys(s: WhatsappBotStep): string[] {
  const out: string[] = [];
  const n = (s.next_step_key ?? "").trim();
  if (n) out.push(n);
  for (const opt of s.options || []) {
    if (!opt || typeof opt !== "object") continue;
    const o = opt as Record<string, unknown>;
    const nk = String(o.next_step_key || o.next || "").trim();
    if (nk) out.push(nk);
  }
  return out;
}

function edgeLabelForNext(step: WhatsappBotStep): string {
  return step.next_step_key?.trim() ? "next" : "";
}

function longestPathLayers(steps: WhatsappBotStep[]): Map<string, number> {
  const keyToStep = new Map(steps.map((s) => [s.step_key, s]));
  const hasIncoming = new Set<string>();
  for (const s of steps) {
    for (const t of collectOutgoingKeys(s)) {
      if (keyToStep.has(t)) hasIncoming.add(t);
    }
  }
  const layer = new Map<string, number>();
  for (const s of steps) {
    layer.set(s.step_key, 0);
  }
  const maxIter = Math.max(steps.length + 2, 8);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (const s of steps) {
      let best = 0;
      if (hasIncoming.has(s.step_key)) {
        for (const p of steps) {
          if (collectOutgoingKeys(p).includes(s.step_key)) {
            best = Math.max(best, (layer.get(p.step_key) ?? 0) + 1);
          }
        }
      }
      if ((layer.get(s.step_key) ?? -1) !== best) {
        layer.set(s.step_key, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

type StepNodeData = Record<string, unknown> & {
  step: WhatsappBotStep;
  selected: boolean;
};

type WhatsappStepRfNode = Node<StepNodeData, "whatsappStep">;

const StepNode = memo(function StepNode({ data }: NodeProps<WhatsappStepRfNode>) {
  const { step, selected } = data;
  const preview = (step.message_template || "").replace(/\s+/g, " ").trim().slice(0, 140);
  return (
    <div className={`${styles.node} ${selected ? styles.nodeSelected : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.kind}>{step.kind}</div>
      <div className={styles.key}>{step.step_key}</div>
      <div className={styles.preview}>{preview || "(sem texto)"}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

type MissingNodeData = Record<string, unknown> & { key: string };

type MissingStepRfNode = Node<MissingNodeData, "missingStep">;

const MissingNode = memo(function MissingNode({ data }: NodeProps<MissingStepRfNode>) {
  return (
    <div className={`${styles.node} ${styles.missing}`}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.kind}>Ausente</div>
      <div className={styles.key}>{data.key}</div>
      <div className={styles.preview}>Nenhum passo com esta chave no fluxo.</div>
    </div>
  );
});

const nodeTypes = {
  whatsappStep: StepNode,
  missingStep: MissingNode,
} satisfies NodeTypes;

const X_SP = 300;
const Y_SP = 128;

export type WhatsappBotFlowDiagramProps = {
  flow: WhatsappBotFlow;
  selectedStepId: number | null;
  onSelectStep: (stepId: number) => void;
};

type FlowDiagramNode = WhatsappStepRfNode | MissingStepRfNode;

export function WhatsappBotFlowDiagram({ flow, selectedStepId, onSelectStep }: WhatsappBotFlowDiagramProps) {
  const { nodes, edges } = useMemo(() => {
    const steps = [...(flow.steps || [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const keyToStep = new Map(steps.map((s) => [s.step_key, s]));
    const missingKeys = new Set<string>();
    for (const s of steps) {
      for (const t of collectOutgoingKeys(s)) {
        if (!keyToStep.has(t)) missingKeys.add(t);
      }
    }

    const layer = longestPathLayers(steps);
    const byLayer = new Map<number, WhatsappBotStep[]>();
    for (const s of steps) {
      const L = layer.get(s.step_key) ?? 0;
      if (!byLayer.has(L)) byLayer.set(L, []);
      byLayer.get(L)!.push(s);
    }
    for (const [, arr] of byLayer) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    }

    const nodesOut: FlowDiagramNode[] = [];
    const layersSorted = [...byLayer.entries()].sort((a, b) => a[0] - b[0]);
    let maxLayer = 0;
    for (const [L] of layersSorted) maxLayer = Math.max(maxLayer, L);
    for (const [L, arr] of layersSorted) {
      arr.forEach((step, idx) => {
        nodesOut.push({
          id: String(step.id),
          type: "whatsappStep",
          position: { x: L * X_SP, y: idx * Y_SP },
          data: { step, selected: selectedStepId === step.id },
        } satisfies WhatsappStepRfNode);
      });
    }

    let missY = 0;
    for (const mk of [...missingKeys].sort()) {
      nodesOut.push({
        id: `missing-${mk}`,
        type: "missingStep",
        position: { x: (maxLayer + 1) * X_SP, y: missY * Y_SP },
        data: { key: mk },
      } satisfies MissingStepRfNode);
      missY += 1;
    }

    const edgesOut: Edge[] = [];
    let ei = 0;
    const pushEdge = (fromId: string, toId: string, label: string) => {
      const id = `e-${fromId}-${toId}-${ei++}`;
      const missing = toId.startsWith("missing-");
      edgesOut.push({
        id,
        source: fromId,
        target: toId,
        label,
        type: "smoothstep",
        animated: missing,
        style: { stroke: missing ? "#ea580c" : "#64748b", strokeWidth: missing ? 2 : 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: missing ? "#ea580c" : "#64748b" },
        labelStyle: { fill: "#334155", fontWeight: 500, fontSize: 11 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "#fff", fillOpacity: 0.92 },
      });
    };

    for (const s of steps) {
      const fromId = String(s.id);
      const nk = (s.next_step_key ?? "").trim();
      if (nk) {
        const toId = keyToStep.has(nk) ? String(keyToStep.get(nk)!.id) : `missing-${nk}`;
        pushEdge(fromId, toId, edgeLabelForNext(s) || "next");
      }
      const opts = s.options || [];
      for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];
        if (!opt || typeof opt !== "object") continue;
        const o = opt as Record<string, unknown>;
        const next = String(o.next_step_key || o.next || "").trim();
        if (!next) continue;
        const ok = String(o.key || o.value || i + 1);
        const lab = String(o.label || o.text || ok);
        const toId = keyToStep.has(next) ? String(keyToStep.get(next)!.id) : `missing-${next}`;
        pushEdge(fromId, toId, `${ok}: ${lab.slice(0, 24)}${lab.length > 24 ? "…" : ""}`);
      }
    }

    return { nodes: nodesOut, edges: edgesOut };
  }, [flow.id, flow.updated_at, flow.steps, selectedStepId]);

  const onNodeClick = useCallback<NodeMouseHandler<FlowDiagramNode>>(
    (_, node) => {
      if (node.type === "whatsappStep" && node.id && !Number.isNaN(Number(node.id))) {
        onSelectStep(Number(node.id));
      }
    },
    [onSelectStep],
  );

  return (
    <div className={styles.wrap}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.15 }}
        minZoom={0.35}
        maxZoom={1.4}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor="rgba(15,23,42,0.12)" />
      </ReactFlow>
    </div>
  );
}
