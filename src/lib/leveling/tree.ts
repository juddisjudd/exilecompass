// Passive-tree data loading, pathofexile.com URL decoding, spec-delta math,
// and SVG generation. Ported from HeartofPhos/exile-leveling
// (web/src/state/tree/{index,svg,url-tree}.ts + SkillTreeViewer/url-tree-delta.ts),
// with jotai atoms → plain async functions and the Handlebars CSS template →
// a generated style string using the app's theme tokens.

import type { SkillTree } from './vendor/tree.js';
import type { Poe1BuildTree } from '$lib/poe1Pob';

// ── Loaded-tree shape (data loading lives in treeData.ts — Vite-glob based,
//    kept separate so this module stays pure/testable under plain runtimes) ──

export interface LoadedTree {
  version: string;
  skillTree: SkillTree.Data;
  nodeLookup: SkillTree.NodeLookup;
  svg: string;
  viewBox: ViewBox;
}

/** Assemble a LoadedTree from raw per-version JSON (used by treeData.ts). */
export function assembleTree(version: string, skillTree: SkillTree.Data): LoadedTree {
  const nodeLookup: SkillTree.NodeLookup = {};
  for (const graph of skillTree.graphs) {
    Object.assign(nodeLookup, graph.nodes);
  }
  const { svg, viewBox } = buildSvg(skillTree, nodeLookup);
  return { version, skillTree, nodeLookup, svg, viewBox };
}

// ── URL decode (pathofexile.com passive-skill-tree links, version >= 6) ─────

export interface UrlTreeData {
  name: string;
  version: string;
  ascendancy?: SkillTree.Ascendancy;
  nodes: string[];
  masteries: Record<string, string>;
}

function decodeBase64Url(value: string): Uint8Array {
  const unescaped = value.replace(/_/g, '/').replace(/-/g, '+');
  return Uint8Array.from(atob(unescaped), (c) => c.charCodeAt(0));
}

const readU16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const readU32 = (b: Uint8Array, o: number) =>
  (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];

function readU16s(b: Uint8Array, offset: number, length: number): number[] {
  if (b.length < offset + length * 2) throw new Error('invalid u16 buffer');
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push(readU16(b, offset + i * 2));
  return out;
}

export function decodeUrlTree(buildTree: Poe1BuildTree, loaded: LoadedTree): UrlTreeData {
  const data = /.*\/(.*?)$/.exec(buildTree.url)?.[1];
  if (!data) throw new Error(`invalid tree url: ${buildTree.url}`);

  const buffer = decodeBase64Url(data);
  const version = readU32(buffer, 0);
  const classId = buffer[4];
  const ascendancyId = buffer[5];

  if (version < 6) throw new Error('unsupported tree url version');

  const nodesOffset = 7;
  const nodesCount = buffer[6];
  const clusterOffset = nodesOffset + nodesCount * 2 + 1;
  const clusterCount = buffer[clusterOffset - 1];
  const masteryOffset = clusterOffset + clusterCount * 2 + 1;
  const masteryCount = buffer[masteryOffset - 1] * 2;

  // Cluster-jewel nodes aren't in the tree data — filter them out.
  const nodes = readU16s(buffer, nodesOffset, nodesCount)
    .map((x) => x.toString())
    .filter((x) => loaded.nodeLookup[x] !== undefined);

  const masteries: Record<string, string> = {};
  const masteryData = readU16s(buffer, masteryOffset, masteryCount);
  for (let i = 0; i < masteryData.length; i += 2) {
    masteries[masteryData[i + 1].toString()] = masteryData[i].toString();
  }

  return {
    name: buildTree.name,
    version: buildTree.version,
    ascendancy:
      ascendancyId > 0
        ? loaded.skillTree.ascendancies[
            loaded.skillTree.classes[classId].ascendancies[ascendancyId - 1]
          ]
        : undefined,
    nodes,
    masteries,
  };
}

export const EMPTY_URL_TREE: UrlTreeData = {
  name: '',
  version: '',
  nodes: [],
  masteries: {},
};

// ── Spec delta (active / added / removed) ───────────────────────────────────

export interface UrlTreeDelta {
  nodesActive: string[];
  nodesAdded: string[];
  nodesRemoved: string[];
  connectionsActive: string[];
  connectionsAdded: string[];
  connectionsRemoved: string[];
  masteries: Record<string, string>;
}

export function buildUrlTreeDelta(
  currentTree: UrlTreeData,
  previousTree: UrlTreeData,
  skillTree: SkillTree.Data,
): UrlTreeDelta {
  const nodesCurrent = new Set(currentTree.nodes);
  const nodesPrevious = new Set(previousTree.nodes);

  for (const [nodeId, effectId] of Object.entries(currentTree.masteries)) {
    if (previousTree.masteries[nodeId] !== effectId) nodesPrevious.delete(nodeId);
  }

  const nodesActive = new Set([...nodesCurrent].filter((n) => nodesPrevious.has(n)));
  const nodesAdded = new Set([...nodesCurrent].filter((n) => !nodesPrevious.has(n)));
  const nodesRemoved = new Set([...nodesPrevious].filter((n) => !nodesCurrent.has(n)));

  if (currentTree.ascendancy !== undefined) nodesActive.add(currentTree.ascendancy.startNodeId);

  const masteries: Record<string, string> = {};
  for (const lookup of [previousTree.masteries, currentTree.masteries]) {
    for (const [nodeId, effectId] of Object.entries(lookup)) masteries[nodeId] = effectId;
  }

  const connectionsActive: string[] = [];
  const connectionsAdded: string[] = [];
  const connectionsRemoved: string[] = [];
  for (const graph of skillTree.graphs) {
    for (const connection of graph.connections) {
      const id = `${connection.a}-${connection.b}`;
      const aActive = nodesActive.has(connection.a);
      const bActive = nodesActive.has(connection.b);
      if (aActive && bActive) connectionsActive.push(id);

      const aAdded = nodesAdded.has(connection.a);
      const bAdded = nodesAdded.has(connection.b);
      if ((aAdded && (bAdded || bActive)) || (bAdded && (aAdded || aActive)))
        connectionsAdded.push(id);

      const aRemoved = nodesRemoved.has(connection.a);
      const bRemoved = nodesRemoved.has(connection.b);
      if ((aRemoved && (bRemoved || bActive)) || (bRemoved && (aRemoved || aActive)))
        connectionsRemoved.push(id);
    }
  }

  return {
    nodesActive: [...nodesActive],
    nodesAdded: [...nodesAdded],
    nodesRemoved: [...nodesRemoved],
    connectionsActive,
    connectionsAdded,
    connectionsRemoved,
    masteries,
  };
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box (in tree/world coordinates, same space as the svg viewBox)
 *  of the delta's interesting nodes. */
export function calculateBounds(delta: UrlTreeDelta, loaded: LoadedTree): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const update = (nodeId: string) => {
    const node = loaded.nodeLookup[nodeId];
    if (!node) return;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  };

  if (delta.nodesAdded.length === 0 && delta.nodesRemoved.length === 0) {
    for (const id of delta.nodesActive) update(id);
  } else {
    for (const id of delta.nodesAdded) update(id);
    for (const id of delta.nodesRemoved) update(id);
  }

  const padding = 1250;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

// ── SVG generation ──────────────────────────────────────────────────────────

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PADDING = 550;
const ASCENDANCY_BORDER_RADIUS = 650;
const ASCENDANCY_ASCENDANT_BORDER_RADIUS = 750;
const CONNECTION_STROKE_WIDTH = 20;
const CONNECTION_ACTIVE_STROKE_WIDTH = 35;

type NodeConstants = Partial<Record<SkillTree.Node['k'], { radius: number; cls?: string }>>;

const TREE_CONSTANTS: NodeConstants = {
  Mastery: { radius: 50, cls: 'mastery' },
  Keystone: { radius: 75, cls: 'keystone' },
  Notable: { radius: 60, cls: 'notable' },
  Jewel: { radius: 60, cls: 'notable' },
  Normal: { radius: 40, cls: 'normal' },
};

const ASCENDANCY_CONSTANTS: NodeConstants = {
  Ascendancy_Start: { radius: 30 },
  Notable: { radius: 65, cls: 'notable' },
  Normal: { radius: 45, cls: 'normal' },
  Jewel: { radius: 65, cls: 'notable' },
};

function buildSvg(tree: SkillTree.Data, nodeLookup: SkillTree.NodeLookup) {
  const viewBox: ViewBox = {
    x: tree.bounds.minX - PADDING,
    y: tree.bounds.minY - PADDING,
    w: tree.bounds.maxX - tree.bounds.minX + PADDING * 2,
    h: tree.bounds.maxY - tree.bounds.minY + PADDING * 2,
  };

  // width/height 100%: the viewer pans/zooms by mutating the viewBox attribute
  // (vectors re-render crisp at any zoom) rather than CSS-transforming the
  // element (which rasterizes the layer once and scales the bitmap → blur).
  let svg = `<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += buildSubTree(tree.graphs[tree.graphIndex], nodeLookup, TREE_CONSTANTS);

  for (const [, ascendancy] of Object.entries(tree.ascendancies)) {
    const startNode = nodeLookup[ascendancy.startNodeId];
    const radius =
      ascendancy.id === 'Ascendant'
        ? ASCENDANCY_ASCENDANT_BORDER_RADIUS
        : ASCENDANCY_BORDER_RADIUS;
    svg += `<g class="ascendancy ${ascendancy.id}">\n`;
    svg += `<circle cx="${startNode.x}" cy="${startNode.y}" r="${radius}" class="border"/>\n`;
    svg += buildSubTree(tree.graphs[ascendancy.graphIndex], nodeLookup, ASCENDANCY_CONSTANTS);
    svg += `</g>\n`;
  }

  svg += `</svg>\n`;
  return { svg, viewBox };
}

function buildSubTree(
  graph: SkillTree.Graph,
  nodeLookup: SkillTree.NodeLookup,
  constants: NodeConstants,
) {
  let out = `<g class="connections">\n`;
  for (const connection of graph.connections) {
    const id = `${connection.a}-${connection.b}`;
    const a = nodeLookup[connection.a];
    const b = nodeLookup[connection.b];
    if (connection.s !== undefined) {
      const d = connection.s.w === 'CW' ? 1 : 0;
      out += `<path d="M ${a.x} ${a.y} A ${connection.s.r} ${connection.s.r} 0 0 ${d} ${b.x} ${b.y}" id="c${id}" />\n`;
    } else {
      out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" id="c${id}" />\n`;
    }
  }
  out += `</g>\n<g class="nodes">\n`;
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const c = constants[node.k];
    if (!c) continue;
    out += `<circle cx="${node.x}" cy="${node.y}" id="n${nodeId}" r="${c.radius}"${c.cls ? ` class="${c.cls}"` : ''}/>\n`;
  }
  out += `</g>\n`;
  return out;
}

/** Delta highlight CSS, scoped to #styleId — replaces upstream's Handlebars
 *  template. Colors come from the app's theme tokens so every theme works. */
export function buildDeltaStyles(
  styleId: string,
  delta: UrlTreeDelta,
  ascendancyId: string | undefined,
): string {
  const sel = (prefix: 'n' | 'c', ids: string[]) =>
    ids.length ? `#${styleId} :is(${ids.map((i) => `#${prefix}${i}`).join(', ')})` : null;

  const rules: string[] = [
    `#${styleId} .nodes { fill: color-mix(in srgb, var(--c-muted) 70%, transparent); stroke: none; }`,
    `#${styleId} .nodes .mastery { fill: transparent; }`,
    `#${styleId} .connections { fill: none; stroke: color-mix(in srgb, var(--c-muted) 45%, transparent); stroke-width: ${CONNECTION_STROKE_WIDTH}; }`,
    `#${styleId} .ascendancy { opacity: 0.35; }`,
    ascendancyId ? `#${styleId} .ascendancy.${ascendancyId} { opacity: 1; }` : '',
    `#${styleId} .border { fill: none; stroke: color-mix(in srgb, var(--c-muted) 45%, transparent); stroke-width: ${CONNECTION_STROKE_WIDTH}; }`,
  ];

  const nActive = sel('n', delta.nodesActive);
  if (nActive) rules.push(`${nActive} { fill: var(--c-primary); }`);
  const nAdded = sel('n', delta.nodesAdded);
  if (nAdded) rules.push(`${nAdded} { fill: var(--c-success); }`);
  const nRemoved = sel('n', delta.nodesRemoved);
  if (nRemoved) rules.push(`${nRemoved} { fill: var(--c-red-bright); }`);

  const cActive = sel('c', delta.connectionsActive);
  if (cActive)
    rules.push(`${cActive} { stroke: var(--c-primary); stroke-width: ${CONNECTION_ACTIVE_STROKE_WIDTH}; }`);
  const cAdded = sel('c', delta.connectionsAdded);
  if (cAdded)
    rules.push(`${cAdded} { stroke: var(--c-success); stroke-width: ${CONNECTION_ACTIVE_STROKE_WIDTH}; }`);
  const cRemoved = sel('c', delta.connectionsRemoved);
  if (cRemoved)
    rules.push(`${cRemoved} { stroke: var(--c-red-bright); stroke-width: ${CONNECTION_ACTIVE_STROKE_WIDTH}; }`);

  return rules.filter(Boolean).join('\n');
}
