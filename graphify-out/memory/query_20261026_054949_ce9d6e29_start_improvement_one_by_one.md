---
type: "query"
date: "2026-10-26T05:49:49.737705+00:00"
question: "start improvement one by one"
contributor: "graphify"
outcome: "useful"
source_nodes: ["next_step()", "review()"]
---

# Q: start improvement one by one

## Answer

Expanded from original query via vocab: [workflow, enqueue, state, step, script, approve, creator, schedule, publish, analytics, recommend, retry]. Implemented the first focused improvement: backend/tests/test_workflow_lifecycle.py now locks the workflow transitions MASTER to RESEARCH to SCRIPT to SCRIPT_REVIEW to CREATOR to REVIEW or SCHEDULER to FINISH, and verifies that failed quality forces REVIEW even in AUTO mode. Production behavior was not changed. All backend tests pass: 6 tests and 3 subtests; compileall passes.

## Outcome

- Signal: useful

## Source Nodes

- next_step()
- review()