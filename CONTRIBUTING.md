# Contributing to Vett

Thanks for your interest in contributing.

## Development Setup

```bash
git clone https://github.com/vett-sh/vett.git
cd vett
pnpm install
```

## Common Tasks

```bash
pnpm format:check
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

Format:

```
<type>: <description>

[optional body]

[optional Linear ticket: VETT-XX]
```

Types:
- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation only changes
- `chore:` - Maintenance tasks (deps, CI, etc.)
- `refactor:` - Code change that neither fixes a bug nor adds a feature
- `test:` - Adding or updating tests
- `perf:` - Performance improvements

## Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Ensure checks pass
4. Submit a PR with a clear description

## Release Process

Releases are automated via release-please:

1. Conventional commits merged to `main` are tracked
2. Release-please creates/updates a release PR
3. Merging the release PR creates a tag
4. The tag triggers publishing to npm
