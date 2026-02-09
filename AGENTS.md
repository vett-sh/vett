# Vett Development Guidelines (OSS)

This repository contains:
- `apps/cli`: the `vett` CLI
- `packages/core`: shared schemas/types/parsers used by the CLI

## TypeScript
- ESM (`type: module`) everywhere
- Node >= 20
- Keep public APIs typed; never use `any`

## Validation
- Zod for all validation
- Validate and sanitize all user inputs (treat registry/network data as untrusted)

## Security
- Validate all inputs, expect the worst
- Be careful with filesystem writes; prevent traversal/symlink attacks
- Return only necessary data from APIs (when applicable)
- No secrets in the repo

## Testing
```bash
pnpm format:check
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages:

- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation only changes
- `chore:` - Maintenance tasks (deps, CI, etc.)
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding or updating tests

Include Linear ticket in commit body when applicable:

```
feat: implement skill installation

VETT-24
```
