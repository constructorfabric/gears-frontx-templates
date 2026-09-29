# config -- User Configuration

This directory contains **user-editable** configuration files.

## Files

- `core.toml` - project settings (system name, slug, kit references)
- `artifacts.toml` - artifacts registry (systems, ignore patterns)
- `AGENTS.md` - custom agent navigation rules (add your own WHEN rules here)
- `SKILL.md` - custom skill extensions (add your own skill instructions here)

## Directories

- `kits/{slug}/` - kit files (SKILL.md, AGENTS.md, artifacts/, codebase/, workflows/, scripts/).
  These are updated via `cfs update` or `cfs kit update`.

## Tips

- `AGENTS.md` and `SKILL.md` start empty. Add any project-specific rules or
  skill instructions here - they will be picked up alongside the kit ones.
- The sdlc kit under `kits/` is rebuilt from the pinned v1.2.1 release by
  `cfs update --with-kits yes` (the form CI runs); a plain `cfs update` does
  not touch kits. Local edits under `config/kits/` do not persist or reach CI.
