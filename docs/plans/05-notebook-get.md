# Tool Validation: `notebook_get`
Goal: Retrieve detailed data for a specific notebook.
## Test Case 1: Valid ID
- Command: `tools/call notebook_get {"notebook_id": "f8cf9561-c834-4e4f-b3a4-9843c34093c8"}`
- Expected: Detailed notebook object with sources and metadata.