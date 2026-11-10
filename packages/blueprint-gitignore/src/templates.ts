/**
 * Gitignore section templates. Sourced from https://github.com/github/gitignore (MIT-licensed)
 * with minor adaptations. Kept inline rather than fetched at runtime so blueprint authors can
 * use these offline and during CI.
 *
 * A future `scripts/sync-templates.ts` will refresh these against upstream on a schedule and
 * raise a PR if anything drifts.
 */

export const macOs = `# General
.DS_Store
.AppleDouble
.LSOverride

# Icon must end with two \\r
Icon

# Thumbnails
._*

# Files that might appear in the root of a volume
.DocumentRevisions-V100
.fseventsd
.Spotlight-V100
.TemporaryItems
.Trashes
.VolumeIcon.icns
.com.apple.timemachine.donotpresent

# Directories potentially created on remote AFP share
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apple
`

export const windows = `# Windows thumbnail cache files
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db

# Dump file
*.stackdump

# Folder config file
[Dd]esktop.ini

# Recycle Bin used on file shares
$RECYCLE.BIN/

# Windows Installer files
*.cab
*.msi
*.msix
*.msm
*.msp

# Windows shortcuts
*.lnk
`

export const linux = `*~

# temporary files which can be created if a process still has a handle open of a deleted file
.fuse_hidden*

# KDE directory preferences
.directory

# Linux trash folder which might appear on any partition or disk
.Trash-*

# .nfs files are created when an open file is removed but is still being accessed
.nfs*
`

export const node = `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*

# Diagnostic reports (https://nodejs.org/api/report.html)
report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage
*.lcov
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional stylelint cache
.stylelintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variable files
.env
.env.development.local
.env.test.local
.env.production.local
.env.local
`

export const next = `# Next.js
.next/
out/
next-env.d.ts

# Next.js cache
.next/cache/

# Next.js debug
.next/trace
`

export const vscode = `.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets

# Local History for Visual Studio Code
.history/

# Built Visual Studio Code Extensions
*.vsix
`

export const jetbrains = `# JetBrains IDEs: IntelliJ, RubyMine, PhpStorm, AppCode, PyCharm, CLion, Android Studio, WebStorm, Rider
# Reference: https://intellij-support.jetbrains.com/hc/en-us/articles/206544839

.idea/

# Sensitive or high-churn files
.idea/**/dataSources/
.idea/**/dataSources.ids
.idea/**/dataSources.local.xml

# Gradle
.idea/**/gradle.xml
.idea/**/libraries

# CMake
cmake-build-*/
`

export const tsbuildinfo = `# TypeScript incremental compile artifacts
*.tsbuildinfo
.tsbuildinfo
`

// The templates below follow github/gitignore. Where one is trimmed, the comment above it says
// why: lockfiles, `tsconfig*.json`, `*.tsbuildinfo` (the `tsbuildinfo` section owns that) and
// `.vscode` are never ignored here, and rules the `node` section already carries are dropped.

// Trimmed: the Node template covers the rest of what Vite writes.
export const vite = `# Vite
*.timestamp-*.mjs
vite.config.*.timestamp*
.vite/
`

// Trimmed: `.env*` rules live in the `node` section.
export const astro = `# Astro
dist/
.astro/
`

// Trimmed: `.env` rules live in the `node` section; `tsconfig*.json` is never ignored.
export const nuxt = `# Nuxt
.nuxt
.output
.data
.nitro
.cache
dist

# Nuxt generate
.nuxt-*
`

// Trimmed: only what SvelteKit generates; `.env*` rules live in the `node` section.
export const svelteKit = `# SvelteKit
.svelte-kit/
build/
vite.config.js.timestamp-*
vite.config.ts.timestamp-*
`

// Trimmed: `tsconfig*.json`, `*.tsbuildinfo` and the rules the `node` and `vscode` sections
// already carry (`/node_modules`, `npm-debug.log`, `.vscode`, `.idea`) are dropped.
export const angular = `# Angular
/dist
/tmp
/out-tsc
/bazel-out
/.angular/cache
.sass-cache/
/connect.lock
/libpeerconnection.log
testem.log
/typings
__screenshots__/
`

// Trimmed: only the build output; Vue projects ride on the `vite` and `node` sections.
export const vue = `# Vue
dist/
dist-ssr/
*.local
.cache/
`

export const storybook = `# Storybook
storybook-static/
build-storybook.log
debug-storybook.log
`

// Trimmed: `yarn.lock` and the tracked Yarn Berry directories (`.yarn/releases`,
// `.yarn/patches`, `.yarn/plugins`, `.yarn/sdks`) stay tracked.
export const yarn = `# Yarn
.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz
.pnp.*
`

// Trimmed: `pnpm-lock.yaml` stays tracked; only the store and debug logs are ignored.
export const pnpm = `# pnpm
.pnpm-store/
.pnpm-debug.log*
`

export const vim = `# Swap
[._]*.s[a-v][a-z]
!*.svg
[._]*.sw[a-p]
[._]s[a-rt-v][a-z]
[._]ss[a-gi-z]
[._]sw[a-p]

# Session
Session.vim
Sessionx.vim

# Temporary
.netrwhist
*~

# Auto-generated tag files
tags

# Persistent undo
[._]*.un~
`

export const sublimeText = `# Sublime Text
*.tmlanguage.cache
*.tmPreferences.cache
*.stTheme.cache

# Workspace files are user-specific
*.sublime-workspace

# Package control
Package Control.last-run
Package Control.ca-list
Package Control.ca-bundle
Package Control.system-ca-bundle
Package Control.cache/
Package Control.ca-certs/
bh_unicode_properties.cache
GitHub.sublime-settings
`

export const eclipse = `# Eclipse
.metadata
bin/
tmp/
*.tmp
*.bak
*.swp
*~.nib
local.properties
.settings/
.loadpath
.recommenders
.externalToolBuilders/
*.launch
.factorypath
.project
.classpath
`
