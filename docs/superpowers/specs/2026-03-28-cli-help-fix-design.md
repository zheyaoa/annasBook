# CLI Help Flag Fix

## Problem

When running `annas-download search -h`, the main help is displayed instead of the search subcommand help. The `-h` flag is intercepted by the main argument parser before the subcommand can handle it.

## Root Cause

In `commands/cli.ts`, the `parseArgs()` function checks for `-h` / `--help` before detecting the subcommand:

```typescript
while (i < args.length) {
  const arg = args[i];

  // ...config, output, json...

  } else if (arg === '--help' || arg === '-h') {
    printHelp();          // ← Intercepted here before command is detected
    process.exit(0);
  } else if (!arg.startsWith('-') && !command) {
    command = arg;        // ← Command detected too late
    i++;
  }
}
```

When parsing `["search", "-h"]`:
1. `search` → doesn't start with `-`, so `command = "search"`, `i++`
2. `-h` → matches `--help/-h` → prints main help and exits

## Solution

Reorder the condition checks so that `-h` after a command is passed to `commandArgs` for subcommand handling, while standalone `-h` (no command yet) still shows main help.

### Code Change

In `commands/cli.ts`, modify the `parseArgs()` function:

**Before:**
```typescript
} else if (arg === '--help' || arg === '-h') {
  printHelp();
  process.exit(0);
} else if (!arg.startsWith('-') && !command) {
  command = arg;
  i++;
}
```

**After:**
```typescript
} else if (!arg.startsWith('-') && !command) {
  command = arg;
  i++;
} else if ((arg === '--help' || arg === '-h') && command) {
  // -h after command: pass to subcommand
  commandArgs.push(arg);
  i++;
} else if (arg === '--help' || arg === '-h') {
  // -h without command: show main help
  printHelp();
  process.exit(0);
}
```

### Behavior After Fix

| Command | Behavior |
|---------|----------|
| `annas-download -h` | Show main help (unchanged) |
| `annas-download --help` | Show main help (unchanged) |
| `annas-download search -h` | Show search subcommand help |
| `annas-download download -h` | Show download subcommand help |
| `annas-download batch -h` | Show batch subcommand help |
| `annas-download config -h` | Show config subcommand help |
| `annas-download convert -h` | Show convert subcommand help |
| `annas-download search --help` | Show search subcommand help |
| `annas-download -h search` | Show search subcommand help (--help is a global option) |
| `annas-download --help search` | Show search subcommand help |

## Affected File

- `commands/cli.ts` — only file to modify

## Testing

Verify each subcommand's `-h` works:
```bash
annas-download search -h
annas-download download -h
annas-download batch -h
annas-download config -h
annas-download convert -h
```

Each should display its respective subcommand help, not the main help.
