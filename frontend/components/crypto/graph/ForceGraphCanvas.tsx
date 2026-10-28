"use client";

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import type { GraphLink, GraphNode, NodeLabel } from "@/lib/crypto/api";
import { linkKey } from "./graphUtils";

/** Handles the panel uses for its buttons and for placing the hover tooltip. */
export interface GraphController {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

type N = NodeObject<GraphNode>;
type L = LinkObject<GraphNode, GraphLink>;

export interface ForceGraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  width: number;
  height: number;
  /** Particles and layout animation allowed (false under reduced motion). */
  animate: boolean;
  paused: boolean;
  highlight: boolean;
  pathNodeIds: ReadonlySet<string>;
  pathLinkKeys: ReadonlySet<string>;
  selectedId: string | null;
  subjectLabel: string;
  controllerRef: MutableRefObject<GraphController | null>;
  onSelect: (node: GraphNode | null) => void;
  onHover: (node: GraphNode | null, anchor: { x: number; y: number } | null) => void;
}

interface Palette {
  illicit: string;
  licit: string;
  unknown: string;
  subject: string;
  ink: string;
  link: string;
  path: string;
  paper: string;
  font: string;
}

/** Canvas colours come from FinPilot's CSS tokens at runtime (the fallbacks are the same values). */
function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    illicit: v("--badge-rose", "#f0455a"),
    licit: v("--badge-emerald", "#0fb67a"),
    unknown: v("--color-pewter", "#7487a3"),
    subject: v("--color-ember", "#ff6b1a"),
    ink: v("--color-ink", "#0d0d0d"),
    link: v("--color-steel", "#a3b0c7"),
    path: v("--color-ink", "#0d0d0d"),
    paper: v("--color-paper", "#ffffff"),
    font: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

const endId = (e: unknown): string =>
  typeof e === "object" && e !== null ? String((e as { id?: string | number }).id ?? "") : String(e ?? "");

export default function ForceGraphCanvas(props: ForceGraphCanvasProps) {
  const { nodes, links, width, height, animate, paused, highlight, pathNodeIds, pathLinkKeys, selectedId, subjectLabel, controllerRef, onSelect, onHover } = props;
  const fg = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const palette = useMemo(() => readPalette(), []);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);

  // react-force-graph mutates what it is given (positions, resolved link ends): hand it copies.
  const data = useMemo(
    () => ({ nodes: nodes.map((n) => ({ ...n })) as N[], links: links.map((l) => ({ ...l })) as L[] }),
    [nodes, links],
  );

  useEffect(() => {
    controllerRef.current = {
      zoomIn: () => fg.current?.zoom((fg.current.zoom() || 1) * 1.4, 200),
      zoomOut: () => fg.current?.zoom((fg.current.zoom() || 1) / 1.4, 200),
      reset: () => fg.current?.zoomToFit(300, 40),
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  const dim = highlight && pathNodeIds.size > 0;

  const paintNode = useCallback(
    (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const label = node.label as NodeLabel;
      const onPath = pathNodeIds.has(String(node.id));
      ctx.save();
      ctx.globalAlpha = dim && !onPath ? 0.3 : 1;
      if (node.isSubject) {
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, 2 * Math.PI);
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = palette.ink;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 9.5, 0, 2 * Math.PI);
        ctx.fillStyle = palette.ink;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, 2 * Math.PI);
        ctx.fillStyle = palette.subject;
        ctx.fill();
        const size = 12 / scale;
        ctx.font = `600 ${size}px ${palette.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineJoin = "round";
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = palette.paper;
        ctx.strokeText(subjectLabel, x, y + 18 / scale + 2);
        ctx.fillStyle = palette.ink;
        ctx.fillText(subjectLabel, x, y + 18 / scale + 2);
      } else if (label === "illicit") {
        const r = 7.5;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fillStyle = palette.illicit;
        ctx.fill();
        if (onPath) {
          ctx.lineWidth = 2 / scale;
          ctx.strokeStyle = palette.path;
          ctx.stroke();
        }
      } else if (label === "licit") {
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
        ctx.fillStyle = palette.licit;
        ctx.fill();
        if (onPath) {
          ctx.lineWidth = 2 / scale;
          ctx.strokeStyle = palette.path;
          ctx.stroke();
        }
      } else {
        // unknown = hollow square
        const s = 9;
        ctx.beginPath();
        ctx.rect(x - s / 2, y - s / 2, s, s);
        ctx.fillStyle = palette.paper;
        ctx.fill();
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = onPath ? palette.path : palette.unknown;
        ctx.stroke();
      }
      if (String(node.id) === selectedId) {
        ctx.beginPath();
        ctx.arc(x, y, node.isSubject ? 18 : 11, 0, 2 * Math.PI);
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([3 / scale, 2 / scale]);
        ctx.strokeStyle = palette.ink;
        ctx.stroke();
      }
      ctx.restore();
    },
    [dim, palette, pathNodeIds, selectedId, subjectLabel],
  );

  const paintPointer = useCallback((node: N, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, node.isSubject ? 14 : 9, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const onPath = useCallback((l: L) => pathLinkKeys.has(linkKey(endId(l.source), endId(l.target))), [pathLinkKeys]);

  const fitted = useRef<unknown>(null);
  const onEngineStop = useCallback(() => {
    if (fitted.current !== data) {
      fitted.current = data;
      fg.current?.zoomToFit(400, 40);
    }
  }, [data]);

  return (
    <ForceGraph2D<GraphNode, GraphLink>
      ref={fg}
      graphData={data}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      nodeId="id"
      nodeLabel={() => ""}
      nodeCanvasObjectMode={() => "replace"}
      nodeCanvasObject={paintNode}
      nodePointerAreaPaint={paintPointer}
      linkColor={(l) => (highlight && onPath(l) ? palette.path : palette.link)}
      linkWidth={(l) => (highlight && onPath(l) ? 3 : 1)}
      linkDirectionalArrowLength={5}
      linkDirectionalArrowRelPos={0.88}
      linkDirectionalArrowColor={(l) => (highlight && onPath(l) ? palette.path : palette.link)}
      linkDirectionalParticles={animate && !paused ? 2 : 0}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleColor={() => palette.subject}
      cooldownTicks={paused || !animate ? 0 : 160}
      warmupTicks={animate ? 30 : 160}
      d3VelocityDecay={0.32}
      onEngineStop={onEngineStop}
      onNodeClick={(n) => onSelect(byId.get(String(n.id)) ?? null)}
      onBackgroundClick={() => onSelect(null)}
      onNodeHover={(n) => {
        const found = n ? (byId.get(String(n.id)) ?? null) : null;
        const at = n && fg.current ? fg.current.graph2ScreenCoords(n.x ?? 0, n.y ?? 0) : null;
        onHover(found, at);
      }}
    />
  );
}
