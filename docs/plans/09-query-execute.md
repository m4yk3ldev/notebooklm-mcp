# Tool Validation: `notebook_query`
Goal: Ask a question based on notebook sources.
## Test Case 1: Simple Question
- Command: `tools/call notebook_query {"notebook_id": "ID", "query": "What is this about?"}`
- Expected: Answer text and citation list.