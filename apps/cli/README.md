# Vett CLI

CLI for the [Vett](https://vett.sh) secure agent skill registry.

## Installation

```bash
npm install -g vett
```

Or use directly with npx:

```bash
npx vett <command>
```

## Usage

```bash
# Add a skill from the registry
vett add <skill>

# Search for skills
vett search <query>

# Show skill details
vett info <skill>

# List installed skills
vett list

# Update installed skills
vett update [skill]

# Remove a skill
vett remove <skill>

# Check and repair agent symlinks
vett sync --fix

# List detected AI coding agents
vett agents
```

## Commands

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `add <input>`      | Add a skill from URL or registry ref           |
| `search <query>`   | Search for skills                              |
| `info <skill>`     | Show detailed information about a skill        |
| `list`             | List installed skills                          |
| `update [skill]`   | Update installed skill(s) to latest version    |
| `remove <skill>`   | Remove an installed skill                      |
| `sync`             | Check and repair agent symlinks                |
| `agents`           | List detected AI coding agents                 |

## Documentation

For full documentation, visit [vett.sh/docs](https://vett.sh/docs).

## License

MIT
