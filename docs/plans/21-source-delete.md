# Tool Validation: `source_delete`
Goal: Remove a source from a notebook.
## Test Case 1: Delete
- Command: `tools/call source_delete {"notebook_id": "ID", "source_id": "SRC_ID", "confirm": true}`
- Expected: Success message.