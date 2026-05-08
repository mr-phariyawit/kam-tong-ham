#!/usr/bin/env node
// tools/aegis-brain-graph/query.mjs (sprint-v12-05)
//
// Five MCP-style query subcommands over the NDJSON graph from v12-04:
//   impact <name>             BFS forward across all outgoing edges
//   context <name>            1-hop scan, grouped by edge kind (in/out)
//   detect-changes --since <ref>  git diff → node match → 1-hop fanout
//   mentions <topic>          MENTIONED_IN scan
//   wiring <hook-pattern>     WIRES edges originating from matching hooks
//
// Common flags:
//   --root <path>     repo root (default: cwd)
//   --json            machine-readable output
//   --max-depth N     impact only (default: 5)
//   --limit N         cap output rows (default: unlimited)
//
// Spec: AEGIS Knowledge-Layer Mega Plan v1.1, sprint v12-05.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { readNdjson } from './lib.mjs';

// ─── CLI ───────────────────────────────────────────────────────────────────

const VALID_SUBCOMMANDS = new Set(['impact', 'context', 'detect-changes', 'mentions', 'wiring']);

function parseArgs(argv) {
  if (argv.length === 0) {
    console.error('Usage: query.mjs <impact|context|detect-changes|mentions|wiring> <args> [--json] [--max-depth N] [--limit N] [--root <path>]');
    process.exit(2);
  }
  const sub = argv[0];
  if (!VALID_SUBCOMMANDS.has(sub)) {
    console.error(`Unknown subcommand: ${sub}`);
    process.exit(2);
  }
  const rest = argv.slice(1);
  const args = { sub, target: null, since: null, root: process.cwd(), json: false, maxDepth: 5, limit: 0 };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    switch (a) {
      case '--json':       args.json = true; break;
      case '--max-depth':  args.maxDepth = Number(rest[++i]); break;
      case '--limit':      args.limit = Number(rest[++i]); break;
      case '--root':       args.root = path.resolve(rest[++i]); break;
      case '--since':      args.since = rest[++i]; break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith('--')) {
          console.error(`Unknown arg: ${a}`);
          process.exit(2);
        }
        positional.push(a);
    }
  }
  if (sub === 'detect-changes') {
    if (!args.since) { console.error('error: detect-changes requires --since <ref>'); process.exit(2); }
  } else {
    if (positional.length === 0) { console.error(`error: ${sub} requires a target argument`); process.exit(2); }
    args.target = positional[0];
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  query.mjs impact <name> [--max-depth N] [--limit N]
  query.mjs context <name>
  query.mjs detect-changes --since <git-ref>
  query.mjs mentions <topic>
  query.mjs wiring <hook-pattern>

Common flags: --json, --root <path>`);
}

// ─── Graph load ────────────────────────────────────────────────────────────

function loadGraph(root) {
  const graphDir = path.join(root, '.aegis', 'brain', 'graph');
  const nodesPath = path.join(graphDir, 'nodes.ndjson');
  const edgesPath = path.join(graphDir, 'edges.ndjson');
  if (!fs.existsSync(nodesPath) || !fs.existsSync(edgesPath)) {
    console.error('error: graph not found at .aegis/brain/graph/. Run: node tools/aegis-brain-graph/build.mjs --full');
    process.exit(2);
  }
  const nodes = readNdjson(nodesPath);
  const edges = readNdjson(edgesPath);
  // Indexes: by id, by source_path, by name (for fuzzy lookup), edges by src + by dst
  const nodeById = new Map();
  const nodeBySourcePath = new Map();
  const nodeByName = new Map();
  for (const n of nodes) {
    nodeById.set(n.id, n);
    if (n.source_path) nodeBySourcePath.set(n.source_path, n);
    nodeByName.set(n.name, n);
  }
  const edgesBySrc = new Map();
  const edgesByDst = new Map();
  for (const e of edges) {
    if (!edgesBySrc.has(e.src)) edgesBySrc.set(e.src, []);
    edgesBySrc.get(e.src).push(e);
    if (!edgesByDst.has(e.dst)) edgesByDst.set(e.dst, []);
    edgesByDst.get(e.dst).push(e);
  }
  return { nodes, edges, nodeById, nodeBySourcePath, nodeByName, edgesBySrc, edgesByDst };
}

// Resolve a user-provided <name> to a node id. Tries:
//   1. exact id match (e.g. "skill:aegis-live-tail")
//   2. exact name match (e.g. "aegis-live-tail" → looks up across all kinds)
//   3. source_path match (e.g. "skills/aegis-live-tail.md")
function resolveTargetId(graph, target) {
  if (graph.nodeById.has(target)) return target;
  if (graph.nodeByName.has(target)) return graph.nodeByName.get(target).id;
  if (graph.nodeBySourcePath.has(target)) return graph.nodeBySourcePath.get(target).id;
  return null;
}

// ─── Subcommand: impact ────────────────────────────────────────────────────

function queryImpact(graph, target, { maxDepth = 5, limit = 0 } = {}) {
  const startId = resolveTargetId(graph, target);
  if (!startId) return { ok: false, error: `node not found: ${target}` };
  const visited = new Map(); // id → { depth, path }
  const queue = [{ id: startId, depth: 0, via: null, path: [] }];
  visited.set(startId, { depth: 0, path: [] });
  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    const outEdges = graph.edgesBySrc.get(id) || [];
    for (const e of outEdges) {
      if (visited.has(e.dst)) continue;
      const newPath = [...visited.get(id).path, { kind: e.kind, dst: e.dst }];
      visited.set(e.dst, { depth: depth + 1, path: newPath });
      queue.push({ id: e.dst, depth: depth + 1 });
    }
  }
  const results = [];
  for (const [id, info] of visited.entries()) {
    if (id === startId) continue;
    results.push({ id, depth: info.depth, path: info.path });
    if (limit > 0 && results.length >= limit) break;
  }
  results.sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : 1));
  return { ok: true, start: startId, count: results.length, results };
}

// ─── Subcommand: context ───────────────────────────────────────────────────

function queryContext(graph, target) {
  const targetId = resolveTargetId(graph, target);
  if (!targetId) return { ok: false, error: `node not found: ${target}` };
  const incoming = graph.edgesByDst.get(targetId) || [];
  const outgoing = graph.edgesBySrc.get(targetId) || [];
  const groupBy = (edges, otherKey) => {
    const map = new Map();
    for (const e of edges) {
      if (!map.has(e.kind)) map.set(e.kind, []);
      map.get(e.kind).push(e[otherKey]);
    }
    return Object.fromEntries([...map.entries()].map(([k, v]) => [k, v.sort()]));
  };
  return {
    ok: true,
    node: targetId,
    incoming: groupBy(incoming, 'src'),
    outgoing: groupBy(outgoing, 'dst'),
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
  };
}

// ─── Subcommand: detect-changes ────────────────────────────────────────────

function queryDetectChanges(graph, since, root) {
  let changedPaths;
  try {
    const out = execSync(`git diff --name-only ${since}...HEAD`, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    changedPaths = out.split('\n').filter(Boolean);
  } catch (e) {
    return { ok: false, error: `git diff failed: ${e.message.split('\n')[0]}` };
  }
  const matches = [];
  for (const p of changedPaths) {
    const node = graph.nodeBySourcePath.get(p);
    if (!node) continue;
    const out = graph.edgesBySrc.get(node.id) || [];
    const incoming = graph.edgesByDst.get(node.id) || [];
    matches.push({
      path: p,
      node: node.id,
      neighbors: {
        outgoing: out.map((e) => ({ kind: e.kind, dst: e.dst })),
        incoming: incoming.map((e) => ({ kind: e.kind, src: e.src })),
      },
      neighbor_count: out.length + incoming.length,
    });
  }
  return { ok: true, since, changed_paths: changedPaths.length, matched_nodes: matches.length, matches };
}

// ─── Subcommand: mentions ──────────────────────────────────────────────────

function queryMentions(graph, topic) {
  // Try exact id first; otherwise scan node by name; otherwise treat as raw substring.
  const targetId = resolveTargetId(graph, topic);
  const matchEdges = [];
  if (targetId) {
    // Find MENTIONED_IN edges where dst === targetId
    for (const e of graph.edges) {
      if (e.kind === 'MENTIONED_IN' && e.dst === targetId) matchEdges.push(e);
    }
  } else {
    // Substring match: any MENTIONED_IN edge whose dst contains the topic
    for (const e of graph.edges) {
      if (e.kind === 'MENTIONED_IN' && e.dst.includes(topic)) matchEdges.push(e);
    }
  }
  return {
    ok: true,
    topic,
    resolved: targetId,
    count: matchEdges.length,
    mentions: matchEdges.map((e) => ({ doc: e.src, mentions: e.dst })).sort((a, b) => a.doc < b.doc ? -1 : 1),
  };
}

// ─── Subcommand: wiring ────────────────────────────────────────────────────

function queryWiring(graph, hookPattern) {
  // Find all hook nodes whose name CONTAINS the pattern
  const hookNodes = graph.nodes.filter((n) => n.kind === 'hook' && n.name.includes(hookPattern));
  if (hookNodes.length === 0) {
    return { ok: true, pattern: hookPattern, count: 0, hooks: [] };
  }
  const hooks = [];
  for (const h of hookNodes) {
    const wires = (graph.edgesBySrc.get(h.id) || []).filter((e) => e.kind === 'WIRES');
    hooks.push({
      hook: h.id,
      hook_name: h.name,
      command: h.meta?.command || null,
      wires_to: wires.map((e) => e.dst).sort(),
    });
  }
  return { ok: true, pattern: hookPattern, count: hooks.length, hooks };
}

// ─── Output rendering ──────────────────────────────────────────────────────

function render(args, result) {
  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (!result.ok) {
    console.error(`error: ${result.error}`);
    return;
  }
  switch (args.sub) {
    case 'impact':
      console.log(`${result.start} (${result.count} reachable):`);
      for (const r of result.results) {
        const lastVia = r.path.length > 0 ? r.path[r.path.length - 1].kind : '(start)';
        console.log(`  → ${r.id} (depth=${r.depth}, via=${lastVia})`);
      }
      break;
    case 'context':
      console.log(`${result.node}`);
      console.log(`incoming (${result.incomingCount}):`);
      for (const [kind, srcs] of Object.entries(result.incoming)) {
        for (const src of srcs) console.log(`  ${kind}  ← ${src}`);
      }
      console.log(`outgoing (${result.outgoingCount}):`);
      for (const [kind, dsts] of Object.entries(result.outgoing)) {
        for (const dst of dsts) console.log(`  ${kind}  → ${dst}`);
      }
      break;
    case 'detect-changes':
      console.log(`changed paths since ${result.since}: ${result.changed_paths} (matched ${result.matched_nodes})`);
      for (const m of result.matches) {
        console.log(`  ${m.path}`);
        console.log(`    → node: ${m.node}`);
        console.log(`    → ${m.neighbor_count} connected nodes (${m.neighbors.outgoing.length} out, ${m.neighbors.incoming.length} in)`);
      }
      break;
    case 'mentions':
      console.log(`${result.topic}: ${result.count} mention(s)`);
      for (const m of result.mentions) {
        console.log(`  ${m.doc}`);
      }
      break;
    case 'wiring':
      console.log(`${result.pattern}: ${result.count} matching hook(s)`);
      for (const h of result.hooks) {
        console.log(`  ${h.hook_name}`);
        for (const w of h.wires_to) console.log(`    WIRES → ${w}`);
      }
      break;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  const graph = loadGraph(args.root);
  let result;
  switch (args.sub) {
    case 'impact':
      result = queryImpact(graph, args.target, { maxDepth: args.maxDepth, limit: args.limit });
      break;
    case 'context':
      result = queryContext(graph, args.target);
      break;
    case 'detect-changes':
      result = queryDetectChanges(graph, args.since, args.root);
      break;
    case 'mentions':
      result = queryMentions(graph, args.target);
      break;
    case 'wiring':
      result = queryWiring(graph, args.target);
      break;
  }
  render(args, result);
  process.exit(result.ok ? 0 : 1);
}

main();
