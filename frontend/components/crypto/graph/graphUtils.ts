import type { Counts, GraphLink, GraphNode, NodeLabel } from "@/lib/crypto/api";

/** Pure helpers for the evidence graph (no React, no canvas), so they are easy to test. */

export const MAX_RENDERED_NODES = 150;

export type NodeShape = "diamond" | "circle" | "hollow";

/** Shape per label so the graph also works without colour: illicit = diamond, licit = disc, unknown = ring. */
export function nodeShape(label: NodeLabel): NodeShape {
  return label === "illicit" ? "diamond" : label === "licit" ? "circle" : "hollow";
}

export interface Subgraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

const idOf = (end: string | { id?: string | number }): string =>
  typeof end === "string" ? end : String(end.id ?? "");

/** Keeps nodes with `hop <= depth` and only the links whose two ends are both kept. */
export function filterByHop(graph: Subgraph, depth: number): Subgraph {
  const nodes = graph.nodes.filter((n) => n.hop <= depth);
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, links: graph.links.filter((l) => ids.has(idOf(l.source)) && ids.has(idOf(l.target))) };
}

/**
 * Caps the number of nodes drawn. The checked wallet always stays; the rest are kept nearest-first
 * (hop 1 before hop 2 ...) and, within a hop, flagged wallets first.
 */
export function capNodes(
  graph: Subgraph,
  max = MAX_RENDERED_NODES,
): Subgraph & { total: number; capped: boolean } {
  const total = graph.nodes.length;
  if (total <= max) return { ...graph, total, capped: false };
  const rank = (n: GraphNode) =>
    n.isSubject ? -1 : n.hop * 10 + (n.label === "illicit" ? 0 : n.label === "unknown" ? 2 : 1);
  const nodes = [...graph.nodes].sort((a, b) => rank(a) - rank(b)).slice(0, max);
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    links: graph.links.filter((l) => ids.has(idOf(l.source)) && ids.has(idOf(l.target))),
    total,
    capped: true,
  };
}

export interface PathResult {
  /** Node ids from the checked wallet to the nearest flagged wallet, inclusive. */
  nodeIds: string[];
  /** Keys of the links along the path (see `linkKey`). */
  linkKeys: Set<string>;
  hops: number;
}

/** Order-independent key for a link (money direction does not matter for a path). */
export function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Breadth-first search over the *undirected* subgraph from the checked wallet to the nearest node
 * labelled illicit (other than the checked wallet itself). Returns null when there is none in view.
 */
export function shortestPathToIllicit(graph: Subgraph): PathResult | null {
  const subject = graph.nodes.find((n) => n.isSubject);
  if (!subject) return null;
  const label = new Map(graph.nodes.map((n) => [n.id, n.label] as const));
  const adj = new Map<string, string[]>();
  for (const l of graph.links) {
    const a = idOf(l.source);
    const b = idOf(l.target);
    if (!label.has(a) || !label.has(b)) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const prev = new Map<string, string | null>([[subject.id, null]]);
  const queue: string[] = [subject.id];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as string;
    if (cur !== subject.id && label.get(cur) === "illicit") {
      const nodeIds: string[] = [];
      for (let at: string | null = cur; at !== null; at = prev.get(at) ?? null) nodeIds.unshift(at);
      const linkKeys = new Set<string>();
      for (let k = 1; k < nodeIds.length; k++)
        linkKeys.add(linkKey(nodeIds[k - 1] as string, nodeIds[k] as string));
      return { nodeIds, linkKeys, hops: nodeIds.length - 1 };
    }
    for (const next of adj.get(cur) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        queue.push(next);
      }
    }
  }
  return null;
}

/** Highest hop present, at most 3. */
export function maxHop(graph: Subgraph): number {
  return Math.min(
    3,
    graph.nodes.reduce((m, n) => Math.max(m, n.hop), 0),
  );
}

export interface HopCounts {
  hop: 1 | 2 | 3;
  counts: Counts;
}

/** Counts strip rows from `result.neighbors` (hop3 is optional in the contract). */
export function hopCountRows(neighbors: { hop1: Counts; hop2: Counts; hop3?: Counts }): HopCounts[] {
  const rows: HopCounts[] = [
    { hop: 1, counts: neighbors.hop1 },
    { hop: 2, counts: neighbors.hop2 },
  ];
  if (neighbors.hop3) rows.push({ hop: 3, counts: neighbors.hop3 });
  return rows;
}
