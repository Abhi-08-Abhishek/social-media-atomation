---
type: "query"
date: "2026-10-26T04:57:16.093331+00:00"
question: "check and tell me how multi agent is working"
contributor: "graphify"
outcome: "useful"
source_nodes: ["execute_step()", "master_node()", "research_node()", "script_node()", "creator_node()", "scheduler_node()", "advance()"]
---

# Q: check and tell me how multi agent is working

## Answer

Expanded from original query via graph vocabulary: agent, agents, scheduler, master, research, creator, script, plan, step, task, state, checkpoint. The system is a durable sequential pipeline: the worker leases a plan, execute_step chooses one persisted stage, LangGraph dispatches that one node, and later polls continue the plan. Human approval gates scripts and unsafe scheduling; analytics and strategist complete asynchronously after publishing. Source verification: agents/workflow.py, worker.py, agents/research.py, agents/analytics.py.

## Outcome

- Signal: useful

## Source Nodes

- execute_step()
- master_node()
- research_node()
- script_node()
- creator_node()
- scheduler_node()
- advance()