# Vett

Vett is a CLI for discovering, installing, and managing AI agent skills from the Vett registry.

- Registry: https://vett.sh
- npm: `vett`

This repo also publishes `@vett/core`, which contains the shared schemas/types/parsers used by the CLI.

## Install

```bash
npm i -g vett
# or
pnpm add -g vett
```

Run without installing:

```bash
npx -y vett@latest --help
```

## Quickstart

Search and install a skill:

```bash
vett search <query>
vett add <skill-or-url>
```

List and update installed skills:

```bash
vett list
vett update
```

## Commands

- `vett add <input>`: add a skill from a registry ref or URL
- `vett search <query>`: search for skills
- `vett info <skill>`: show details about a skill
- `vett list`: list installed skills
- `vett update [skill]`: update installed skill(s)
- `vett remove <skill>`: remove an installed skill
- `vett sync`: check/repair agent symlinks
- `vett agents`: list detected AI coding agents
- `vett upgrade`: show upgrade instructions

## Configuration

The CLI stores config and an install index under `~/.vett/`.

Environment variables:
- `VETT_REGISTRY_URL`: override the registry base URL (default: `https://vett.sh`)
- `VETT_INSTALL_DIR`: override where skills are installed
- `VETT_TELEMETRY_ENABLED`: set to `false` to disable telemetry
- `VETT_NO_UPDATE_NOTIFIER=1`: disable the update notifier

## Development

```bash
pnpm install
pnpm format:check
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

## Packages

- `apps/cli`: the `vett` CLI
- `packages/core`: `@vett/core`

## License

MIT
