---
type: "query"
date: "2026-10-26T06:03:56.151495+00:00"
question: "continue"
contributor: "graphify"
outcome: "useful"
source_nodes: ["CampaignCreate", "create_campaign()", "create_brief()", "context()", "recommend()"]
---

# Q: continue

## Answer

Expanded from original query via vocab: [campaign, create, update, planner, brief, objective, metric, metrics, creator, analytics, recommend, recommendation]. The campaign lifecycle now stores a validated objective and server-derived target metric, sends both to planning and content generation, and uses the same target metric for post-performance recommendations. Added database migration, campaign form input, API types, and regression coverage.

## Outcome

- Signal: useful

## Source Nodes

- CampaignCreate
- create_campaign()
- create_brief()
- context()
- recommend()