# Portability — extracting this bundle as a Claude Code plugin

This bundle is self-contained inside `.claude/skills/kanban/` (plus a few config touches
elsewhere in the repo). The goal is to package it as a Claude Code plugin so it drops
cleanly into other repos.

References:
[Anthropic Skills docs](https://code.claude.com/docs/en/skills) ·
[Plugins docs](https://code.claude.com/docs/en/plugins) ·
[Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)

## Current state (project-local)

```
projitect/
├── .claude/
│   ├── skills/
│   │   ├── kanban/                       ← foundation skill — fully self-contained
│   │   │   ├── SKILL.md
│   │   │   ├── shared.md
│   │   │   ├── SETUP.md
│   │   │   ├── PORTABILITY.md            ← (this file)
│   │   │   ├── templates/{planner,critic,builder,inspector,tester}.md
│   │   │   ├── scripts/                  ← 14 TS helpers + lib/ + tsconfig.json + README.md
│   │   │   └── bin/launch-trello-mcp.sh  ← MCP launcher
│   │   ├── kanban-init/SKILL.md
│   │   ├── kanban-dump/SKILL.md
│   │   ├── kanban-triage/SKILL.md
│   │   ├── kanban-prioritize/SKILL.md
│   │   ├── kanban-refine/SKILL.md
│   │   ├── kanban-run/SKILL.md
│   │   ├── kanban-help/SKILL.md
│   │   └── grill-me/SKILL.md
│   └── settings.json                     ← Trello-specific perms in `permissions.allow`
├── .mcp.json                             ← references ./.claude/skills/kanban/bin/launch-trello-mcp.sh
├── .env.local.example                    ← credential template
├── docs/kanban/workflows.md              ← human-facing playbook
├── knip.json                             ← entry: .claude/skills/kanban/scripts/*.ts
├── package.json                          ← tsx devDep, kanban:status / kanban:score scripts
└── docs/kanban/overview.md               ← repo-level workflow rules
```

Nine of the nine skills + all the executable infrastructure live inside the kanban skill
directory. The seven things outside that directory are project-config integrations
(`.mcp.json`, `.env.local.example`, `.claude/settings.json`, `docs/kanban/`, `knip.json`,
`package.json` entries).

## Target state (Claude Code plugin)

When ready to extract:

```
projitect-kanban-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/                               ← drop the `.claude/` prefix
│   ├── kanban/                           ← copy the whole directory verbatim, including scripts/ + bin/
│   ├── kanban-init/SKILL.md
│   ├── kanban-dump/SKILL.md
│   ├── kanban-triage/SKILL.md
│   ├── kanban-prioritize/SKILL.md
│   ├── kanban-refine/SKILL.md
│   ├── kanban-run/SKILL.md
│   ├── kanban-help/SKILL.md
│   └── grill-me/SKILL.md
├── .mcp.json                             ← command uses ${CLAUDE_PLUGIN_ROOT} placeholder
├── settings.json                         ← Trello-related entries (lifted from this repo's .claude/settings.json)
├── .env.local.example
├── docs/kanban/workflows.md
└── README.md                             ← prereqs + install + first-run
```

## `.claude-plugin/plugin.json` template

```json
{
  "name": "projitect-kanban",
  "version": "0.1.0",
  "description": "Trello-backed kanban workflow for Claude Code — Brain Dump → Backlog → Plan → Plan Review → Impl → Impl Review → Test → Done, with a human approval gate at every transition.",
  "author": { "name": "..." },
  "homepage": "https://github.com/<owner>/projitect-kanban",
  "repository": "https://github.com/<owner>/projitect-kanban",
  "license": "MIT"
}
```

Only `name` and `description` are required. `version` defaults to the git commit SHA if
omitted, but pinning explicitly is friendlier for marketplace consumers.

## What changes during extraction

1. **Drop `.claude/` prefix on skill directories** — `.claude/skills/<name>/` →
   `skills/<name>/`. The `kanban/` subdir comes along intact (it already contains
   `scripts/` + `bin/` + supporting docs).
2. **MCP launcher path placeholder** — `.mcp.json`'s
   `./.claude/skills/kanban/bin/launch-trello-mcp.sh` becomes
   `${CLAUDE_PLUGIN_ROOT}/skills/kanban/bin/launch-trello-mcp.sh` so it resolves from the
   installed plugin location, not the consuming repo's cwd.
3. **Launcher `repo_root` calculation** — `scripts/kanban/bin/launch-trello-mcp.sh`
   currently walks four directories up to reach the repo root. In a plugin context, the
   launcher needs the _consumer repo's_ `.env.local`, not the plugin's. Replace the
   `repo_root` derivation with something that walks up from the consumer's `cwd`
   (`pwd` at MCP-start time) to find `.git` / `pnpm-workspace.yaml` — the same algorithm
   that `scripts/lib/config.ts`'s `findRepoRoot` uses.
4. **Settings → plugin `settings.json`** — move the Trello-related entries
   (`Bash(jq:*)`, `Bash(curl https://api.trello.com:*)`,
   `Bash(./.claude/skills/kanban/bin/launch-trello-mcp.sh*)`, `mcp__trello__*`,
   `enabledMcpjsonServers: ["trello"]`) out of consumer `.claude/settings.json` and into
   the plugin's `settings.json`.
5. **AGENTS.md references** — a few skill bodies (and the
   [`scripts/README.md`](./scripts/README.md) footer) link to `docs/kanban/overview.md`.
   Replace with plugin-internal links or inline the load-bearing content into
   `kanban/shared.md` / a plugin README.
6. **Project-rule citations in templates** — [`templates/builder.md`](./templates/builder.md)
   cites projitect's Effect v4 / `as`-forbidden / pnpm-only rules. These are
   projitect-specific; in the plugin, swap them with a generic "follow the consuming repo's
   AGENTS.md / CLAUDE.md conventions" directive.
7. **knip + package.json** — the consumer repo's `knip.json` entry pattern and the
   `kanban:status` / `kanban:score` npm scripts reference the in-repo path. In the
   plugin, drop both. Consumers can add similar shortcuts in their own `package.json` if
   they want them; the underlying script invocations work without them. (knip itself
   becomes irrelevant — the plugin doesn't have a knip config.)
8. **tsx availability** — the plugin needs `tsx` available where it's installed. Either
   document it as a prereq in the README or ship a bootstrap script.
9. **`findRepoRoot` semantics** — in plugin context, "the repo root" usually means the
   _consumer's_ repo, not the plugin's install dir. `findRepoRoot` already walks up from
   the script's location, which would land inside the plugin install dir. Switch its
   default `start` from `import.meta.url`-derived to `process.cwd()` so it finds the
   consuming repo when invoked from there.

## What does NOT ship in the plugin

- `.claude/kanban.json` — board-specific to whichever repo installed the plugin.
  Generated by `/kanban-init` per-repo. Stays at consumer-repo `.claude/kanban.json`.
- `.env.local` — per-user credentials. The plugin ships `.env.local.example`; consumers
  copy + fill in.
- `package.json` `kanban:status` / `kanban:score` scripts and `tsx` devDep — these are
  projitect-specific. Consumers add their own if wanted.
- `knip.json` entries — not relevant in plugin context.

## Distribution

Three paths (in order of how locked-down they are):

1. **File-system / git path for testing** — `/plugin install <local-path-or-git-url>`
2. **Private marketplace** — host a git repo containing
   `.claude-plugin/marketplace.json` that catalogs your team's plugins. Teammates run
   `/plugin marketplace add <repo>` then `/plugin install projitect-kanban@<marketplace>`
3. **Community marketplace** — submit to `claude-plugins-community` if appropriate

Versioning: explicit semver in `plugin.json` is friendlier than relying on git-SHA pinning.

## Pre-extraction checklist

When you're ready (post bake-in), the steps in order:

- [ ] Create new repo `projitect-kanban` (or similar). Initialize
      `.claude-plugin/plugin.json`.
- [ ] Copy `.claude/skills/kanban/` → new repo's `skills/kanban/` (whole tree —
      scripts/, bin/, templates/, supporting docs)
- [ ] Copy each `.claude/skills/<other>/` → `skills/<other>/`
- [ ] Copy `.mcp.json`, `.env.local.example`, `docs/kanban/`
- [ ] Update `.mcp.json` to use `${CLAUDE_PLUGIN_ROOT}/skills/kanban/bin/launch-trello-mcp.sh`
- [ ] Update `launch-trello-mcp.sh`'s `repo_root` to walk up from `cwd`, not from
      `BASH_SOURCE` (so it finds the consuming repo, not the plugin install dir)
- [ ] Update `scripts/lib/config.ts`'s `findRepoRoot` default to start from
      `process.cwd()` (same reason as above)
- [ ] Lift Trello-related entries from this repo's `.claude/settings.json` into the
      plugin's `settings.json`
- [ ] Replace AGENTS.md cross-references in skill bodies with plugin-internal links
- [ ] Sanitize projitect-specific rules from `templates/builder.md` (Effect v4, pnpm-only)
- [ ] Write the plugin's `README.md` (prereqs + install + first-run + Trello-token walkthrough)
- [ ] In this repo, remove the now-extracted files and add the plugin via
      `/plugin install <plugin-source>`. Projitect becomes the first consumer.
