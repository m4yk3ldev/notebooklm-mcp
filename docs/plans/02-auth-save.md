# Tool Validation: `save_auth_tokens`
Goal: Manually save provided cookie/token data.
## Test Case 1: Direct Save
- Command: `tools/call save_auth_tokens {"cookies": {"SID": "test"}, "csrf_token": "test"}`
- Expected: Tokens saved to disk, returns success message.