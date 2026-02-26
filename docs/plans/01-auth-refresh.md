# Tool Validation: `refresh_auth`
Goal: Manually trigger a CDP-based session refresh.
## Test Case 1: Active Refresh
- Command: `tools/call refresh_auth {}`
- Expected: Opens Chrome, waits for NotebookLM load, saves tokens, returns success.