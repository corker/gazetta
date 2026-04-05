# Hooks

Shell scripts in this directory are referenced from `.claude/settings.json`.

## Adding a hook

1. Create a script here (e.g., `auto-format.sh`)
2. Make it executable: `chmod +x auto-format.sh`
3. Reference it in `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/auto-format.sh"
      }]
    }]
  }
}
```

## Hook scripts receive JSON on stdin

```json
{
  "session_id": "...",
  "tool_name": "Edit",
  "tool_input": { "file_path": "src/index.ts" }
}
```

Extract values with `jq`: `jq -r '.tool_input.file_path'`
