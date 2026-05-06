## Agent skills

### Backlog

Issues and PRDs live as GitHub issues in `choephix/matt-video-manager`, managed via the `gh` CLI. See `docs/agents/backlog.md`.

### Triage labels

Canonical defaults, except `ready-for-agent` is spelled `Sandcastle` in this repo. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` at the repo root, ADRs under `docs/adr/`. See `docs/agents/domain.md`.

### Branching & pull requests

This repo is a personal fork of `mattpocock/course-video-manager`. Treat `choephix/matt-video-manager` as the only target — never open PRs against upstream, never push to upstream.

- Branches always push to `origin` (which is `choephix/matt-video-manager`). The `upstream` remote, if present, is read-only — used only for occasional `git fetch upstream` to track Matt's changes.
- PRs target `choephix/matt-video-manager:main`. When using `gh pr create`, pass `--repo choephix/matt-video-manager` (or rely on `gh repo set-default choephix/matt-video-manager` having been run once).
- The "Create a pull request for ..." hint that GitHub prints after `git push` opens a page on the fork; if its default base shows `mattpocock/...`, switch the base dropdown to `choephix/matt-video-manager:main` before submitting. (The repo setting "Send pull requests to this repository by default" on `choephix/matt-video-manager` flips that default permanently.)
