# Tool Validation: `notebook_delete`
Goal: Permanently delete a notebook.
## Test Case 1: Delete with Confirmation
- Command: `tools/call notebook_delete {"notebook_id": "ID", "confirm": true}`
- Expected: Success message.