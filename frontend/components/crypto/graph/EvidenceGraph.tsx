"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Route, ZoomIn, ZoomOut } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CheckResponse, GraphNode } from "@/lib/crypto/api";
import { middleEllipsis } from "@/lib/crypto/demoWallets";
import { cn } from "@/lib/utils";
import { useGuardT } from "../guard/copy";
import type { GraphController } from "./ForceGraphCanvas";
import { GraphLegend } from "./GraphLegend";
import { GraphList } from "./GraphList";
import { capNodes, filterByHop, hopCountRows, maxHop, shortestPathToIllicit } from "./graphUtils";
import { NodeDrawer } from "./NodeDrawer";
import { useReducedMotionPref } from "./useReducedMotionPref";

// The canvas library touches `window`: load it on the client only, with a skeleton in its place.
const ForceGraphCanvas = dynamic(() => import("./ForceGraphCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-surface" />,
});

type Depth = 1 | 2 | 3;

function IconButton({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex size-10 cursor-pointer items-center justify-center rounded-chip border transition-all active:scale-[0.96] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember",
        pressed ? "border-lime-dark bg-lime text-ink" : "border-black/[0.08] bg-white text-graphite hover:bg-fog hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Panel({ result }: { result: CheckResponse }) {
  const { g } = useGuardT();
  const reduced = useReducedMotionPref();

  const full = result.subgraph;
  const available = Math.max(1, maxHop(full)) as Depth;
  const [depth, setDepth] = useState<Depth>(Math.min(2, available) as Depth);
  const [paused, setPaused] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [hover, setHover] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const controller = useRef<GraphController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Depth filter first, then the render cap (the checked wallet is always kept).
  const view = useMemo(() => capNodes(filterByHop(full, depth)), [full, depth]);
  const path = useMemo(() => (highlight ? shortestPathToIllicit(view) : null), [highlight, view]);
  const pathNodeIds = useMemo(() => new Set(path?.nodeIds ?? []), [path]);
  const pathLinkKeys = useMemo(() => path?.linkKeys ?? new Set<string>(), [path]);
  const closeNode = useCallback(() => setSelected(null), []);
  const onHover = useCallback((node: GraphNode | null, at: { x: number; y: number } | null) => setHover(node && at ? { node, x: at.x, y: at.y } : null), []);

  // Measure the stage so the canvas always fills it, also in fullscreen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panelRef.current?.requestFullscreen?.();
  };

  const depthOptions = ([1, 2, 3] as const).filter((d) => d <= available);

  return (
    <div ref={panelRef} className={cn("flex min-w-0 flex-col gap-4 bg-white", fullscreen && "h-dvh p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-medium text-ink">{g("wg.graph.title")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {depthOptions.length > 1 && (
            <div role="group" aria-label={g("wg.graph.depth.label")} className="inline-flex rounded-full border border-black/[0.08] bg-fog p-1">
              {depthOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={depth === d}
                  onClick={() => {
                    setDepth(d);
                    setSelected(null);
                  }}
                  className={cn(
                    "min-h-8 min-w-14 cursor-pointer rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember",
                    depth === d ? "bg-lime text-ink shadow-sm" : "text-graphite hover:text-ink",
                  )}
                >
                  {g(d === 1 ? "wg.graph.depth.n" : "wg.graph.depth.nn", { n: d })}
                </button>
              ))}
            </div>
          )}
          <IconButton label={g("wg.graph.zoomin")} onClick={() => controller.current?.zoomIn()}><ZoomIn className="size-4" aria-hidden /></IconButton>
          <IconButton label={g("wg.graph.zoomout")} onClick={() => controller.current?.zoomOut()}><ZoomOut className="size-4" aria-hidden /></IconButton>
          <IconButton label={g("wg.graph.reset")} onClick={() => controller.current?.reset()}><RotateCcw className="size-4" aria-hidden /></IconButton>
          <IconButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
          </IconButton>
          {!reduced && (
            <IconButton label={paused ? g("wg.graph.play") : g("wg.graph.pause")} pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
            </IconButton>
          )}
          <IconButton label={g("wg.graph.path")} pressed={highlight} onClick={() => setHighlight((h) => !h)}>
            <Route className="size-4" aria-hidden />
          </IconButton>
        </div>
      </div>

      <p aria-live="polite" className={cn("text-xs text-graphite", !highlight && "sr-only")}>
        {highlight ? (path ? g("wg.graph.path.found", { n: path.hops }) : g("wg.graph.path.none")) : ""}
      </p>

      <div
        ref={stageRef}
        role="img"
        aria-label={g("wg.graph.aria", { n: view.nodes.length })}
        className={cn(
          "relative w-full min-w-0 overflow-hidden rounded-surface border border-black/[0.08] bg-surface-subtle",
          fullscreen ? "min-h-0 flex-1" : "h-[320px] sm:h-[420px]",
        )}
      >
        {size.w > 0 && size.h > 0 ? (
          <ForceGraphCanvas
            nodes={view.nodes}
            links={view.links}
            width={size.w}
            height={size.h}
            animate={!reduced}
            paused={paused}
            highlight={highlight}
            pathNodeIds={pathNodeIds}
            pathLinkKeys={pathLinkKeys}
            selectedId={selected?.id ?? null}
            subjectLabel={g("wg.graph.legend.subject")}
            controllerRef={controller}
            onSelect={setSelected}
            onHover={onHover}
          />
        ) : (
          <Skeleton className="size-full" />
        )}
        {hover && !selected && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-chip border border-black/[0.1] bg-white px-2.5 py-1 text-xs whitespace-nowrap shadow-md"
            style={{ left: hover.x, top: hover.y }}
          >
            <span className="font-mono" translate="no" lang="en">{middleEllipsis(hover.node.id, 6, 6)}</span>
          </div>
        )}
        <NodeDrawer node={selected} onClose={closeNode} />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <GraphLegend />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
          {hopCountRows(result.neighbors).map((r) => (
            <li key={r.hop} className="tnum">
              {g("wg.graph.counts", { n: r.hop, illicit: r.counts.illicit, licit: r.counts.licit, unknown: r.counts.unknown })}
            </li>
          ))}
        </ul>
        {view.capped && <p className="text-xs text-graphite">{g("wg.graph.showing", { shown: view.nodes.length, total: view.total })}</p>}
      </div>

      <GraphList nodes={view.nodes} />
    </div>
  );
}

/**
 * Evidence graph for a check result: force-directed neighbourhood of the checked wallet, hop depth filter (1/2/3),
 * path to the nearest flagged wallet, node details side panel, and a text list as the accessible alternative.
 * Contract: `<EvidenceGraph result={checkResponse} />`.
 */
export function EvidenceGraph({ result }: { result: CheckResponse }) {
  const { g } = useGuardT();
  if (result.subgraph.nodes.length === 0) {
    return <EmptyState title={g("wg.graph.empty.title")} body={g("wg.graph.empty.body")} />;
  }
  // Remount (fresh depth, selection, path) whenever a different wallet or report is shown.
  return (
    <Card className="p-5 sm:p-6">
      <Panel key={`${result.address}:${result.reportHash ?? ""}`} result={result} />
    </Card>
  );
}

export default EvidenceGraph;
