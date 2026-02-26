# Tool Validation: `research_status`
Goal: Poll progress of a research task.
## Test Case 1: Poll Job
- Command: `tools/call research_status {"job_id": "JOB_ID"}`
- Expected: Status (running/complete) and progress percentage.