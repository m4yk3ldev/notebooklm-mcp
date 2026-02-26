# Tool Validation: `notebook_list`
Goal: Retrieve all notebooks for the current user.
## Test Case 1: Default List
- Command: `tools/call notebook_list {}`
- Expected: JSON with "notebooks" array and "count".