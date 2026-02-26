# Tool Validation: `studio_status`
Goal: Poll progress of a studio creation task.
## Test Case 1: Poll Job
- Command: `tools/call studio_status {"job_id": "JOB_ID"}`
- Expected: Job status and artifact data if complete.