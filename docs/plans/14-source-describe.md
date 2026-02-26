# Tool Validation: `source_describe`
Goal: Get metadata for a specific source.
## Test Case 1: Describe
- Command: `tools/call source_describe {"notebook_id": "ID", "source_id": "SRC_ID"}`
- Expected: Source details (title, type, summary).