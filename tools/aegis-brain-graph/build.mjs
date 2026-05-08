#!/usr/bin/env node
// tools/aegis-brain-graph/build.mjs (sprint-v12-04)
//
// Walks AEGIS sources and emits a content-addressable knowledge graph as
// NDJSON files at .aegis/brain/graph/{nodes,edges}.ndjson + meta.json.
//
// Modes:
//   --full           rebuild from scratch (deterministic, byte-equal across runs)
//   --incremental    skip if no source changed since last build (mtime-gated)
//   (default: --incremental for hook callers; --full for human callers)
//
// Common flags:
//   --root <path>    repo root (default: cwd)
//   --quiet          suppress non-error output (for hooks)
//   --json           machine-readable summary
//
// Spec: AEGIS Knowledge-Layer Mega Plan v1.1, sprint v12-04 stories B + C + D.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  BUILDER_VERSION,
  writeGraphAtomic,
  compareNodes,
  compareEdges,
  parseFrontmatter,
  mtimeOf,
  maxMtime,
  nodeId,
  listFiles,
} from './lib.mjs';

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    mode: 'incremental',
    root: process.cwd(),
    quiet: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--full':         args.mode = 'full'; break;
      case '--incremental':  args.mode = 'incremental'; break;
      case '--root':         args.root = path.resolve(argv[++i]); break;
      case '--quiet':        args.quiet = true; break;
      case '--json':         args.json = true; break;
      case '-h':
      case '--help':
        console.log('Usage: build.mjs [--full | --incremental] [--root <path>] [--quiet] [--json]');
        process.exit(0);
        break;
      default:
        console.error(`Unknown arg: ${a}`);
        process.exit(2);
    }
  }
  return args;
}

// ─── Source discovery ──────────────────────────────────────────────────────

function discoverSources(root) {
  const sources = {
    skills: listFiles(path.join(root, 'skills'), { ext: '.md' }),
    settings: [path.join(root, '.claude', 'settings.json')].filter((p) => fs.existsSync(p)),
    sprintCloses: listFiles(path.join(root, '.aegis', 'brain', 'sprints'), { recursive: true })
      .filter((p) => p.endsWith('/close.md')),
    tests: listFiles(path.join(root, 'tests'))
      .filter((p) => /\.(sh|mjs|js)$/.test(p)),
    issues: listFiles(path.join(root, '.aegis', 'brain', 'issues'), { ext: '.yaml' }),
    approvals: listFiles(path.join(root, '.aegis', 'brain', 'approvals'), { ext: '.yaml' }),
    brainDocs: [
      ...listFiles(path.join(root, '.aegis', 'brain', 'learnings'), { recursive: true, ext: '.md' }),
      ...listFiles(path.join(root, '.aegis', 'brain', 'resonance'), { recursive: true, ext: '.md' }),
      ...listFiles(path.join(root, '.aegis', 'brain', 'handoffs'), { recursive: true, ext: '.md' }),
      ...listFiles(path.join(root, '.aegis', 'brain', 'retrospectives'), { recursive: true, ext: '.md' }),
      // Agent prompts (sprint-v13-01-phase-c): include them as graph nodes so
      // tool references land MENTIONED_IN edges. Without this, `query mentions
      // <tool>` returns 0 even when an agent prompt names the tool.
      ...listFiles(path.join(root, '.claude', 'agents'), { ext: '.md' })
        .filter((p) => !p.includes('/_archived/')),
    ],
    toolPackages: listToolPackages(path.join(root, 'tools')),
    singleFileTools: listSingleFileTools(path.join(root, 'tools')),
  };
  // Compute global source_mtime_max across everything
  const allFiles = [
    ...sources.skills,
    ...sources.settings,
    ...sources.sprintCloses,
    ...sources.tests,
    ...sources.issues,
    ...sources.approvals,
    ...sources.brainDocs,
    ...sources.toolPackages.flatMap((p) => p.files),
    ...sources.singleFileTools,
  ];
  sources.maxMtime = maxMtime(allFiles);
  return sources;
}

function listToolPackages(toolsDir) {
  if (!fs.existsSync(toolsDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(toolsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = path.join(toolsDir, entry.name);
    const files = listFiles(pkgDir, { recursive: true })
      .filter((p) => /\.(mjs|js|sh)$/.test(p));
    if (files.length > 0) out.push({ name: entry.name, dir: pkgDir, files });
  }
  return out;
}

// Top-level single-file tools (e.g. tools/aegis-progress.sh) are first-class
// graph citizens too — sprint-v13-01-phase-c. Without these nodes,
// `query mentions aegis-progress` returned 0 even after agent files referenced
// the tool. Now every aegis-*.sh under tools/ shows up as a `kind: "tool"`
// node and the MENTIONED_IN edges from agents/skills/closes resolve correctly.
function listSingleFileTools(toolsDir) {
  if (!fs.existsSync(toolsDir)) return [];
  return fs.readdirSync(toolsDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .filter((e) => /^aegis-.+\.(sh|mjs|js)$/.test(e.name))
    .map((e) => path.join(toolsDir, e.name));
}

// ─── Parsers ───────────────────────────────────────────────────────────────

function parseSkill(filePath, root) {
  const rel = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = parseFrontmatter(content);
  if (!fm || !fm.name) return { nodes: [], edges: [] };
  const skillId = nodeId('skill', fm.name);
  const nodes = [{
    id: skillId,
    kind: 'skill',
    name: fm.name,
    source_path: rel,
    mtime: Math.floor(mtimeOf(filePath)),
    meta: {
      profile: fm.profile || 'standard',
      triggers: fm.triggers || { en: [], th: [] },
    },
  }];
  const edges = [];
  // READS edges → brain-path nodes
  for (const p of (fm.reads || [])) {
    const dstId = nodeId('brain-path', p);
    edges.push({ src: skillId, dst: dstId, kind: 'READS', meta: {} });
    nodes.push({ id: dstId, kind: 'brain-path', name: p, source_path: '', mtime: 0, meta: {} });
  }
  // WRITES edges
  for (const p of (fm.writes || [])) {
    const dstId = nodeId('brain-path', p);
    edges.push({ src: skillId, dst: dstId, kind: 'WRITES', meta: {} });
    nodes.push({ id: dstId, kind: 'brain-path', name: p, source_path: '', mtime: 0, meta: {} });
  }
  // SUPERSEDES edges (skill → predecessor name; predecessor may not have a node)
  for (const pred of (fm.supersedes || [])) {
    edges.push({ src: skillId, dst: nodeId('skill', pred), kind: 'SUPERSEDES', meta: {} });
  }
  return { nodes, edges, _skill: { name: fm.name, wires: fm.wires || [], tests: fm.tests || [] } };
}

function parseSettingsHooks(filePath, root) {
  const rel = path.relative(root, filePath);
  const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const nodes = [];
  const edges = [];
  const hooksRoot = settings.hooks || {};
  for (const event of Object.keys(hooksRoot)) {
    const matchers = hooksRoot[event];
    if (!Array.isArray(matchers)) continue;
    for (const m of matchers) {
      const matcher = m.matcher || '';
      for (const h of (m.hooks || [])) {
        const cmd = h.command || '';
        // Extract a tool path from the command (the last `.mjs` / `.sh` token, if present)
        const toolMatch = cmd.match(/(tools\/[\w\-./]+\.(?:mjs|js|sh))/);
        const hookCmdShort = toolMatch ? toolMatch[1] : cmd.slice(-60);
        const hookName = `${event}:${matcher}:${hookCmdShort}`;
        const hookIdStr = nodeId('hook', hookName);
        nodes.push({
          id: hookIdStr,
          kind: 'hook',
          name: hookName,
          source_path: rel,
          mtime: Math.floor(mtimeOf(filePath)),
          meta: { event, matcher, command: cmd },
        });
        if (toolMatch) {
          const toolPath = toolMatch[1];
          edges.push({
            src: hookIdStr,
            dst: nodeId('tool', toolPath),
            kind: 'WIRES',
            meta: {},
          });
        }
      }
    }
  }
  return { nodes, edges };
}

function parseToolPackages(packages, root) {
  const nodes = [];
  for (const pkg of packages) {
    for (const f of pkg.files) {
      const rel = path.relative(root, f);
      // strip leading "tools/" for the name (e.g. "aegis-live-tail/emit.mjs")
      const name = rel.startsWith('tools/') ? rel.slice('tools/'.length) : rel;
      nodes.push({
        id: nodeId('tool', name),
        kind: 'tool',
        name,
        source_path: rel,
        mtime: Math.floor(mtimeOf(f)),
        meta: { package: pkg.name },
      });
    }
  }
  return { nodes, edges: [] };
}

function parseSprintClose(filePath, root) {
  const rel = path.relative(root, filePath);
  // sprint id is the parent directory name like "sprint-v11-01" → "v11-01"
  const dirName = path.basename(path.dirname(filePath));
  const sprintName = dirName.replace(/^sprint-/, '');
  const content = fs.readFileSync(filePath, 'utf8');
  const sprintIdStr = nodeId('sprint', sprintName);
  const status = (content.match(/\*\*Status\*\*:?\s*([A-Z]+)/) || [])[1] || 'CLOSED';
  const points = (content.match(/(\d+)\s*\/\s*\d+\s*pt/) || [])[1] || null;
  const nodes = [{
    id: sprintIdStr,
    kind: 'sprint',
    name: sprintName,
    source_path: rel,
    mtime: Math.floor(mtimeOf(filePath)),
    meta: { status, points: points ? Number(points) : null },
  }];
  const edges = [];
  // Find "## Stories shipped" table and pull tool/skill references from each row.
  // Row pattern: any reference to `tools/<pkg>/<file>` or `[skill](path)` or markdown link to tools/skills.
  const refRe = /tools\/([\w\-./]+\.(?:mjs|js|sh))/g;
  let match;
  const seenRefs = new Set();
  while ((match = refRe.exec(content)) !== null) {
    const toolPath = match[1];
    const key = `tool:${toolPath}`;
    if (seenRefs.has(key)) continue;
    seenRefs.add(key);
    edges.push({
      src: sprintIdStr,
      dst: nodeId('tool', toolPath),
      kind: 'IMPLEMENTS',
      meta: {},
    });
  }
  // Also catch [skill-name](skills/skill-name.md) or skills/skill-name.md
  const skillRe = /skills\/([\w\-]+)\.md/g;
  while ((match = skillRe.exec(content)) !== null) {
    const skillName = match[1];
    const key = `skill:${skillName}`;
    if (seenRefs.has(key)) continue;
    seenRefs.add(key);
    edges.push({
      src: sprintIdStr,
      dst: nodeId('skill', skillName),
      kind: 'IMPLEMENTS',
      meta: {},
    });
  }
  return { nodes, edges };
}

function parseTest(filePath, root) {
  const rel = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const edges = [];
  const testIdStr = nodeId('test', rel);
  const seenRefs = new Set();
  // tools/<pkg>/<file> mention → TESTS edge from test → tool
  const refRe = /tools\/([\w\-./]+\.(?:mjs|js|sh))/g;
  let match;
  while ((match = refRe.exec(content)) !== null) {
    const toolPath = match[1];
    const key = `tool:${toolPath}`;
    if (seenRefs.has(key)) continue;
    seenRefs.add(key);
    edges.push({
      src: testIdStr,
      dst: nodeId('tool', toolPath),
      kind: 'TESTS',
      meta: {},
    });
  }
  // Test files are leaves (no node themselves) but the edges are still valuable
  // for query-impact. We do, however, emit a node for them so they can be
  // queried directly.
  const node = {
    id: testIdStr,
    kind: 'test',
    name: rel,
    source_path: rel,
    mtime: Math.floor(mtimeOf(filePath)),
    meta: {},
  };
  return { nodes: [node], edges };
}

function parseIssueOrApproval(filePath, root, kind) {
  const rel = path.relative(root, filePath);
  const name = path.basename(filePath, '.yaml');
  return {
    nodes: [{
      id: nodeId(kind, name),
      kind,
      name,
      source_path: rel,
      mtime: Math.floor(mtimeOf(filePath)),
      meta: {},
    }],
    edges: [],
  };
}

function parseBrainDoc(filePath, root, allNodeNames) {
  const rel = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const docIdStr = nodeId('brain-doc', rel);
  const node = {
    id: docIdStr,
    kind: 'brain-doc',
    name: rel,
    source_path: rel,
    mtime: Math.floor(mtimeOf(filePath)),
    meta: {},
  };
  const edges = [];
  // For each known node name, scan the doc body for a mention.
  // We only check `skill:` and `tool:` and `sprint:` kinds (the ones humans typically reference).
  const seen = new Set();
  for (const target of allNodeNames) {
    if (!target) continue;
    if (seen.has(target.id)) continue;
    // Use a word-boundary-ish regex but be tolerant of slashes.
    const escapedName = target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedName}\\b`);
    if (pattern.test(content)) {
      seen.add(target.id);
      edges.push({
        src: docIdStr,
        dst: target.id,
        kind: 'MENTIONED_IN',
        meta: {},
      });
    }
  }
  return { nodes: [node], edges };
}

// ─── Build orchestrator ────────────────────────────────────────────────────

function build({ root, mode }) {
  const graphDir = path.join(root, '.aegis', 'brain', 'graph');
  const metaPath = path.join(graphDir, 'meta.json');
  const sources = discoverSources(root);

  // Incremental skip — if no source has changed since the last build, exit early.
  if (mode === 'incremental' && fs.existsSync(metaPath)) {
    const prevMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (
      prevMeta.source_mtime_max &&
      sources.maxMtime <= prevMeta.source_mtime_max
    ) {
      return { skipped: true, prev: prevMeta };
    }
  }

  // Full or invalidated incremental: collect everything fresh.
  const allNodes = [];
  const allEdges = [];

  // Phase 1: parse skills + tools (these establish skill/tool node IDs we'll
  // reference from later parsers).
  const skillResults = sources.skills.map((f) => parseSkill(f, root));
  for (const r of skillResults) {
    allNodes.push(...r.nodes);
    allEdges.push(...r.edges);
  }
  const toolPkgResult = parseToolPackages(sources.toolPackages, root);
  allNodes.push(...toolPkgResult.nodes);

  // Single-file tools (sprint-v13-01-phase-c): create one tool node per
  // top-level aegis-*.sh / aegis-*.mjs in tools/. Same shape as package files.
  for (const f of sources.singleFileTools) {
    const rel = path.relative(root, f);
    const name = rel.startsWith('tools/') ? rel.slice('tools/'.length) : rel;
    allNodes.push({
      id: nodeId('tool', name),
      kind: 'tool',
      name,
      source_path: rel,
      mtime: Math.floor(mtimeOf(f)),
      meta: { single_file: true },
    });
  }

  // WIRES from skills (skill manifest declares wires that reference hook names).
  // We map "PostToolUse:.*:tools/aegis-live-tail/emit.mjs" → edge from hook to tool.
  // Since the hook node may not exist yet, we'll resolve in phase 3 (after settings.json parse).

  // Phase 2: settings.json hooks
  for (const f of sources.settings) {
    const r = parseSettingsHooks(f, root);
    allNodes.push(...r.nodes);
    allEdges.push(...r.edges);
  }

  // Phase 3: skill-declared TESTS edges (skill → test)
  for (const r of skillResults) {
    if (!r._skill) continue;
    const skillIdStr = nodeId('skill', r._skill.name);
    for (const t of r._skill.tests) {
      allEdges.push({
        src: skillIdStr,
        dst: nodeId('test', t),
        kind: 'TESTS',
        meta: {},
      });
    }
  }

  // Phase 4: sprint close.md
  for (const f of sources.sprintCloses) {
    const r = parseSprintClose(f, root);
    allNodes.push(...r.nodes);
    allEdges.push(...r.edges);
  }

  // Phase 5: tests
  for (const f of sources.tests) {
    const r = parseTest(f, root);
    allNodes.push(...r.nodes);
    allEdges.push(...r.edges);
  }

  // Phase 6: issues + approvals
  for (const f of sources.issues) {
    const r = parseIssueOrApproval(f, root, 'issue');
    allNodes.push(...r.nodes);
    allEdges.push(...r.edges);
  }
  for (const f of sources.approvals) {
    const r = parseIssueOrApproval(f, root, 'approval');
    allNodes.push(...r.nodes);
    allEdges.push(...r.edges);
  }

  // Dedupe nodes by id (later wins for meta but should be stable since we
  // sort by (kind, name) and sources don't conflict on same id with different content).
  const nodeMap = new Map();
  for (const n of allNodes) nodeMap.set(n.id, n);
  const dedupedNodes = [...nodeMap.values()];

  // Phase 7: brain docs (MENTIONED_IN edges) — needs all node names by now
  for (const f of sources.brainDocs) {
    const r = parseBrainDoc(f, root, dedupedNodes);
    nodeMap.set(r.nodes[0].id, r.nodes[0]);
    allEdges.push(...r.edges);
  }

  const finalNodes = [...nodeMap.values()];

  // Dedupe edges (key: src|kind|dst)
  const edgeMap = new Map();
  for (const e of allEdges) {
    edgeMap.set(`${e.src}|${e.kind}|${e.dst}`, e);
  }
  const dedupedEdges = [...edgeMap.values()];

  // Sort deterministically.
  finalNodes.sort(compareNodes);
  dedupedEdges.sort(compareEdges);

  const meta = {
    built_at: new Date().toISOString(),
    source_mtime_max: sources.maxMtime,
    node_count: finalNodes.length,
    edge_count: dedupedEdges.length,
    builder_version: BUILDER_VERSION,
  };

  writeGraphAtomic(graphDir, { nodes: finalNodes, edges: dedupedEdges, meta });

  return { skipped: false, nodes: finalNodes.length, edges: dedupedEdges.length, meta };
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = build({ root: args.root, mode: args.mode });
  } catch (e) {
    if (!args.quiet) console.error(`graph build failed: ${e.message}`);
    process.exit(args.json ? 1 : 1);
  }
  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else if (!args.quiet) {
    if (result.skipped) {
      console.log(`graph: skipped (no source change since ${new Date(result.prev.built_at).toISOString()})`);
    } else {
      console.log(`graph: built ${result.nodes} nodes, ${result.edges} edges (mode=${args.mode})`);
    }
  }
  process.exit(0);
}

main();
