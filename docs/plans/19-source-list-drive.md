# Tool Validation: `source_list_drive`
Goal: List Drive sources with freshness status.
## Test Case 1: List Freshness
- Command: `tools/call source_list_drive {"notebook_id": "ID"}`
- Expected: Array of sources with `is_fresh` boolean.