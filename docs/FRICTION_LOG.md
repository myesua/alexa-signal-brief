# Friction log — optional but up to 10% bonus
# Format per entry: task, steps, expected vs actual, severity, workaround, suggestion

## 1. 2026-09-12 — list_signals RAW_QUERY_RESTRICTED
* Task: call list_signals sort=ranking via Sygnal MCP
* Steps: POST /mcp tools/call list_signals limit 3
* Expected: ranked signals. Actual: {"code":"RAW_QUERY_RESTRICTED", ... and not allowed}
* Severity: high (blocks live demo)
* Workaround: fixtures/signals.json + MOCK_SIGNALS=true
* Suggestion: allowlist `and` in workspace raw queries / version the fix

## 2. TODO — add 2-4 more during build
