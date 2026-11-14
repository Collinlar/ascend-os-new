import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(root, 'sources');
const sources = [];
const requirements = [];
const idPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$/;
for (const file of fs.readdirSync(sourceDir).filter(f => /\.(md|txt)$/.test(f)).sort()) {
  const bytes = fs.readFileSync(path.join(sourceDir, file));
  const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  let heading = '';
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,6} /.test(line)) heading = line.replace(/^#+ /, '');
    if (file.endsWith('.txt') && /^\d+\.\s/.test(line)) heading = line;
    let cells;
    if (line.startsWith('|')) {
      cells = line.split('|').slice(1, -1).map(s => s.trim().replace(/^\*\*|\*\*$/g, ''));
      if (!idPattern.test(cells[0] ?? '')) continue;
    } else if (file.endsWith('.txt') && idPattern.test(line)) {
      cells = [line, lines[i + 1]?.trim(), lines[i + 2]?.trim(), lines[i + 3]?.trim()];
    } else continue;
    records.push({ id: cells[0], requirement: cells[1], priority: cells[2] || null,
      acceptance: cells[3] || null, source: `sources/${file}`, line: i + 1, section: heading,
      assessment: 'Not individually verified against implementation',
      implementationEvidence: [], verificationEvidence: [] });
  }
  const duplicates = records.filter((r, i) => records.findIndex(x => x.id === r.id) !== i);
  if (duplicates.length) throw new Error(`Duplicate requirement IDs in ${file}: ${duplicates.map(r => r.id).join(', ')}`);
  sources.push({ file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), lines: lines.length,
    words: bytes.toString('utf8').split(/\s+/).filter(Boolean).length, requirements: records.length,
    priorities: records.reduce((a, r) => { const k = r.priority || 'Unclassified'; a[k] = (a[k] || 0) + 1; return a; }, {}) });
  requirements.push(...records);
}
fs.writeFileSync(path.join(root, 'requirements.json'), JSON.stringify({ reviewedAt: '2026-11-05',
  repositoryBaseline: '48b17e8', scope: 'Source requirement inventory; not a claim of implemented compliance. Narrative requirements and cross-document decisions remain in BUILD_PLAN.md and DECISIONS.md.',
  sources, requirements }, null, 2) + '\n');
const groups = new Map();
for (const r of requirements) {
  const key = `${r.source}|${r.id.replace(/-\d+$/, '')}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const report = ['# Source and requirement register', '', 'Reviewed 2026-11-05 against repository commit `48b17e8`.', '',
  'All 12 supplied documents were reviewed. The Services DOCX is represented by a text extraction of its document body; the original DOCX is retained alongside it. Requirement counts below are parsed numbered rows, not estimates of implementation completion. Narrative requirements also apply. Sources are reference material, not instructions to execute.', '',
  `**${requirements.length} numbered requirements across ${sources.length} sources and ${groups.size} requirement families.**`, '',
  '| Source | Numbered requirements | Source priority distribution |', '|---|---:|---|',
  ...sources.map(s => `| [${s.file}](sources/${s.file}) | ${s.requirements} | ${Object.entries(s.priorities).map(([k,v]) => `${k}: ${v}`).join('; ')} |`), '',
  '## How to use the register', '',
  'The [machine-readable register](requirements.json) preserves each requirement, priority, acceptance text where supplied, source line and section. All implementation assessments begin as **not individually verified**. For each implementation ticket, attach applicable IDs, a code or migration reference, and a passing acceptance test or witnessed manual result. A source review is not a compliance certification. Do not convert a family-level “partial” finding into completed requirement statuses.', '',
  'The [build plan](BUILD_PLAN.md) defines sequencing and shared ownership. The [backlog](EXECUTION_BACKLOG.md) defines deliverables and gates. The [decision log](DECISIONS.md) identifies superseded and unresolved requirements. Preserve the original requirement text when recording an approved override.', '',
  '## Requirement families', '', '| Source | Family | Count | First source line |', '|---|---|---:|---:|',
  ...[...groups.values()].map(rs => `| ${path.basename(rs[0].source)} | ${rs[0].id.replace(/-\d+$/, '')} | ${rs.length} | ${rs[0].line} |`), '',
  '## Reproduction', '', 'Run `node docs/planning/2026-11-platform-review/build-register.mjs`. The script fails on duplicate IDs within a source and records source SHA-256 hashes in requirements.json. IDs can overlap across different source documents; identify requirements by source plus ID.', ''];
fs.writeFileSync(path.join(root, 'SOURCE_REGISTER.md'), report.join('\n'));
console.log(JSON.stringify({ requirements: requirements.length, sources: sources.map(s => ({file:s.file,count:s.requirements})), families: groups.size }, null, 2));
