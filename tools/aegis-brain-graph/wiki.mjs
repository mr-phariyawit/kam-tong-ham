#!/usr/bin/env node
// tools/aegis-brain-graph/wiki.mjs (sprint-v12-06)
//
// Auto-generate PROJECT_INDEX.md (master TOC) and per-skill / per-sprint
// pages under _aegis-output/wiki/ from the v12-04 NDJSON graph.
//
// Determinism: byte-equal-skip — if the new content matches the existing
// file, no write happens (avoids spurious mtime updates and git diff churn).
//
// Modes:
//   (default) write outputs
//   --check   exit 1 if any wiki page is out-of-date; no writes
//
// Common flags:
//   --root <path>       repo root (default: cwd)
//   --out <path>        wiki output dir (default: <root>/_aegis-output/wiki)
//   --index <path>      master index path (default: <root>/PROJECT_INDEX.md)
//   --quiet             suppress non-error output
//   --json              machine-readable summary
//
// Spec: AEGIS Knowledge-Layer Mega Plan v1.1, sprint v12-06 stories A + B.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readNdjson } from './lib.mjs';

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    out: null,
    index: null,
    check: false,
    quiet: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--root':   args.root = path.resolve(argv[++i]); break;
      case '--out':    args.out = path.resolve(argv[++i]); break;
      case '--index':  args.index = path.resolve(argv[++i]); break;
      case '--check':  args.check = true; break;
      case '--quiet':  args.quiet = true; break;
      case '--json':   args.json = true; break;
      case '-h':
      case '--help':
        console.log('Usage: wiki.mjs [--root <path>] [--out <dir>] [--index <path>] [--check] [--quiet] [--json]');
        process.exit(0);
        break;
      default:
        console.error(`Unknown arg: ${a}`);
        process.exit(2);
    }
  }
  if (!args.out)   args.out   = path.join(args.root, '_aegis-output', 'wiki');
  if (!args.index) args.index = path.join(args.root, 'PROJECT_INDEX.md');
  return args;
}

// ─── Graph load ────────────────────────────────────────────────────────────

function loadGraph(root) {
  const graphDir = path.join(root, '.aegis', 'brain', 'graph');
  const nodesPath = path.join(graphDir, 'nodes.ndjson');
  const edgesPath = path.join(graphDir, 'edges.ndjson');
  const metaPath  = path.join(graphDir, 'meta.json');
  if (!fs.existsSync(nodesPath) || !fs.existsSync(edgesPath)) {
    console.error('error: graph not found at .aegis/brain/graph/. Run: node tools/aegis-brain-graph/build.mjs --full');
    process.exit(2);
  }
  const nodes = readNdjson(nodesPath);
  const edges = readNdjson(edgesPath);
  const meta  = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const edgesBySrc = new Map();
  const edgesByDst = new Map();
  for (const e of edges) {
    if (!edgesBySrc.has(e.src)) edgesBySrc.set(e.src, []);
    edgesBySrc.get(e.src).push(e);
    if (!edgesByDst.has(e.dst)) edgesByDst.set(e.dst, []);
    edgesByDst.get(e.dst).push(e);
  }
  return { nodes, edges, meta, edgesBySrc, edgesByDst };
}

// ─── Page builders ─────────────────────────────────────────────────────────

function buildSkillPage(node, graph) {
  const incoming = graph.edgesByDst.get(node.id) || [];
  const outgoing = graph.edgesBySrc.get(node.id) || [];
  const wires = incoming.filter((e) => e.kind === 'WIRES').map((e) => e.src);
  const implementsBy = incoming.filter((e) => e.kind === 'IMPLEMENTS').map((e) => e.src);
  const mentionedBy = incoming.filter((e) => e.kind === 'MENTIONED_IN').map((e) => e.src);
  const tests = outgoing.filter((e) => e.kind === 'TESTS').map((e) => e.dst);
  const reads = outgoing.filter((e) => e.kind === 'READS').map((e) => e.dst);
  const writes = outgoing.filter((e) => e.kind === 'WRITES').map((e) => e.dst);
  const supersedes = outgoing.filter((e) => e.kind === 'SUPERSEDES').map((e) => e.dst);
  const triggers = node.meta?.triggers || {};
  const lines = [
    `<!-- Auto-generated from .aegis/brain/graph/ — edit skills/${node.name}.md or skill-graph-manifest.json -->`,
    '',
    `# Skill: ${node.name}`,
    '',
    `**Profile:** ${node.meta?.profile || 'standard'}`,
    `**Source:** \`${node.source_path}\``,
    '',
    '## Triggers',
    '',
    '- **EN:** ' + ((triggers.en || []).map((t) => `\`${t}\``).join(', ') || '_(none)_'),
    '- **TH:** ' + ((triggers.th || []).map((t) => `\`${t}\``).join(', ') || '_(none)_'),
  ];
  appendListSection(lines, 'Wires (hooks that fire this skill)', wires);
  appendListSection(lines, 'Implemented in (sprints)', implementsBy);
  appendListSection(lines, 'Tests', tests);
  appendListSection(lines, 'Reads (brain paths)', reads);
  appendListSection(lines, 'Writes (brain paths)', writes);
  appendListSection(lines, 'Supersedes', supersedes);
  appendListSection(lines, 'Mentioned in (brain docs)', mentionedBy);
  return lines.join('\n') + '\n';
}

function buildSprintPage(node, graph) {
  const outgoing = graph.edgesBySrc.get(node.id) || [];
  const implementsList = outgoing.filter((e) => e.kind === 'IMPLEMENTS').map((e) => e.dst);
  const lines = [
    `<!-- Auto-generated from .aegis/brain/graph/ — edit ${node.source_path} -->`,
    '',
    `# Sprint ${node.name}`,
    '',
    `**Status:** ${node.meta?.status || 'unknown'}`,
    node.meta?.points != null ? `**Points:** ${node.meta.points}` : '',
    `**Source:** \`${node.source_path}\``,
  ].filter(Boolean);
  appendListSection(lines, 'Implements', implementsList);
  return lines.join('\n') + '\n';
}

function appendListSection(lines, title, items) {
  lines.push('');
  lines.push(`## ${title}`);
  lines.push('');
  if (items.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const it of items.sort()) lines.push(`- ${it}`);
  }
}

function buildIndex(graph, meta) {
  const skills = graph.nodes.filter((n) => n.kind === 'skill').sort((a, b) => a.name < b.name ? -1 : 1);
  const sprints = graph.nodes.filter((n) => n.kind === 'sprint').sort((a, b) => a.name < b.name ? -1 : 1);
  const tools = graph.nodes.filter((n) => n.kind === 'tool');
  const hooks = graph.nodes.filter((n) => n.kind === 'hook').sort((a, b) => a.name < b.name ? -1 : 1);
  const issues = graph.nodes.filter((n) => n.kind === 'issue');
  // Group tools by package
  const toolPkgs = new Map();
  for (const t of tools) {
    const pkg = t.meta?.package || 'misc';
    if (!toolPkgs.has(pkg)) toolPkgs.set(pkg, []);
    toolPkgs.get(pkg).push(t.name);
  }
  const toolPkgList = [...toolPkgs.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);

  const lines = [
    '<!-- Auto-generated from .aegis/brain/graph/ — edit topic pages under _aegis-output/wiki/ -->',
    `<!-- built_at: ${meta.built_at || 'unknown'} -->`,
    `<!-- node_count: ${meta.node_count || 0} edge_count: ${meta.edge_count || 0} -->`,
    '',
    '# AEGIS Project Index',
    '',
    '> Auto-generated from the knowledge graph (`.aegis/brain/graph/`).',
    '> Per-topic content lives at [`_aegis-output/wiki/`](_aegis-output/wiki/).',
    '> Regenerate via `node tools/aegis-brain-graph/wiki.mjs`.',
    '',
    '## Governance Docs',
    '',
    '- [CLAUDE.md](CLAUDE.md) — agent rules + golden rules',
    '- [DoD.md](DoD.md) — repo-wide completion bar',
    '- [ARCHITECTURE.md](ARCHITECTURE.md) — concern → file map',
    '- [GUARDRAILS.md](GUARDRAILS.md) — recurring failure-mode catalog',
    '- [CLAUDE_safety.md](CLAUDE_safety.md), [CLAUDE_agents.md](CLAUDE_agents.md), [CLAUDE_skills.md](CLAUDE_skills.md), [CLAUDE_lessons.md](CLAUDE_lessons.md)',
    '',
    `## Skills (${skills.length})`,
    '',
  ];
  for (const s of skills) {
    const profile = s.meta?.profile || 'standard';
    lines.push(`- [${s.name}](_aegis-output/wiki/skill-${s.name}.md) — _${profile}_`);
  }
  lines.push('');
  lines.push(`## Sprints (${sprints.length})`);
  lines.push('');
  for (const s of sprints) {
    const status = s.meta?.status || '';
    const pts = s.meta?.points != null ? ` · ${s.meta.points}pt` : '';
    lines.push(`- [${s.name}](_aegis-output/wiki/sprint-${s.name}.md) — ${status}${pts}`);
  }
  lines.push('');
  lines.push(`## Tools (${toolPkgList.length} packages, ${tools.length} files)`);
  lines.push('');
  for (const [pkg, files] of toolPkgList) {
    lines.push(`- **${pkg}** (${files.length} files)`);
  }
  lines.push('');
  lines.push(`## Hooks (${hooks.length})`);
  lines.push('');
  // Group hooks by event
  const hookEvents = new Map();
  for (const h of hooks) {
    const ev = h.meta?.event || 'unknown';
    if (!hookEvents.has(ev)) hookEvents.set(ev, []);
    hookEvents.get(ev).push(h);
  }
  for (const [ev, list] of [...hookEvents.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    lines.push(`- **${ev}** (${list.length})`);
    for (const h of list) {
      lines.push(`  - \`${h.meta?.matcher || ''}\` → \`${h.meta?.command || ''}\``);
    }
  }
  if (issues.length > 0) {
    lines.push('');
    lines.push(`## Open issues (${issues.length})`);
    lines.push('');
    for (const i of issues) lines.push(`- ${i.name}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Determinism: byte-equal-skip write ────────────────────────────────────

function writeIfChanged(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) return { changed: false };
  }
  fs.writeFileSync(filePath, content);
  return { changed: true };
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  const graph = loadGraph(args.root);
  const skillNodes = graph.nodes.filter((n) => n.kind === 'skill');
  const sprintNodes = graph.nodes.filter((n) => n.kind === 'sprint');

  const summary = { written: [], unchanged: [], stale: [] };

  // Per-skill pages
  for (const n of skillNodes) {
    const out = path.join(args.out, `skill-${n.name}.md`);
    const content = buildSkillPage(n, graph);
    if (args.check) {
      if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== content) {
        summary.stale.push(out);
      }
      continue;
    }
    const r = writeIfChanged(out, content);
    (r.changed ? summary.written : summary.unchanged).push(out);
  }
  // Per-sprint pages
  for (const n of sprintNodes) {
    const out = path.join(args.out, `sprint-${n.name}.md`);
    const content = buildSprintPage(n, graph);
    if (args.check) {
      if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== content) {
        summary.stale.push(out);
      }
      continue;
    }
    const r = writeIfChanged(out, content);
    (r.changed ? summary.written : summary.unchanged).push(out);
  }
  // Master index
  const indexContent = buildIndex(graph, graph.meta);
  if (args.check) {
    if (!fs.existsSync(args.index) || fs.readFileSync(args.index, 'utf8') !== indexContent) {
      summary.stale.push(args.index);
    }
  } else {
    const r = writeIfChanged(args.index, indexContent);
    (r.changed ? summary.written : summary.unchanged).push(args.index);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({
      written: summary.written.length,
      unchanged: summary.unchanged.length,
      stale: summary.stale.length,
      mode: args.check ? 'check' : 'write',
    }, null, 2) + '\n');
  } else if (!args.quiet) {
    if (args.check) {
      console.log(`wiki: ${summary.stale.length} pages out-of-date`);
      for (const s of summary.stale.slice(0, 10)) console.log(`  - ${path.relative(args.root, s)}`);
    } else {
      console.log(`wiki: ${summary.written.length} files written, ${summary.unchanged.length} unchanged (skipped)`);
    }
  }

  if (args.check && summary.stale.length > 0) process.exit(1);
  process.exit(0);
}

main();
