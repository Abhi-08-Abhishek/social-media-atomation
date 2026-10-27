# Graph Report - app  (2026-10-26)

## Corpus Check
- Corpus is ~19,218 words - fits in a single context window. You may not need a graph.

## Summary
- 440 nodes · 1282 edges · 14 communities (10 shown, 4 thin omitted)
- Extraction: 75% EXTRACTED · 25% INFERRED · 0% AMBIGUOUS · INFERRED: 319 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Content Creation
- API Operations
- Campaign Schemas
- Analytics Agents
- Media Generation
- Meta Advertising
- Research Pipeline
- Agent Orchestration
- API Error Handling
- Authentication

## God Nodes (most connected - your core abstractions)
1. `transaction()` - 60 edges
2. `table()` - 57 edges
3. `Contract` - 57 edges
4. `get_settings()` - 30 edges
5. `now()` - 30 edges
6. `ResearchProviders` - 20 edges
7. `create_content()` - 16 edges
8. `execute_step()` - 16 edges
9. `run_research()` - 15 edges
10. `publish_campaign()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `sync_campaign()` --calls--> `table()`  [INFERRED]
  agents/analytics.py → db.py
- `sync_campaign()` --calls--> `transaction()`  [INFERRED]
  agents/analytics.py → db.py
- `sync()` --calls--> `transaction()`  [INFERRED]
  agents/analytics.py → db.py
- `EditorialItem` --inherits--> `Contract`  [EXTRACTED]
  agents/creator.py → schemas/research.py
- `EditorialReviews` --inherits--> `Contract`  [EXTRACTED]
  agents/creator.py → schemas/research.py

## Import Cycles
- None detected.

## Communities (14 total, 4 thin omitted)

### Community 0 - "Content Creation"
Cohesion: 0.05
Nodes (36): context(), create_content(), generate(), review_posts(), skills_for(), EditorialItem, EditorialReviews, requested_format() (+28 more)

### Community 1 - "API Operations"
Cohesion: 0.08
Nodes (60): approve_script(), edit_script(), enqueue(), find_script(), locked_script_task(), owned_plan(), progress(), table() (+52 more)

### Community 2 - "Campaign Schemas"
Cohesion: 0.06
Nodes (38): ScriptEdit, BrandProfile, Brief, CampaignCreate, CampaignUpdate, Caption, CaptionEdit, CarouselSlides (+30 more)

### Community 3 - "Analytics Agents"
Cohesion: 0.07
Nodes (25): normalize_metrics(), sync(), sync_campaign(), SyncRequest, analyze(), metric_value(), normalize_insight(), number() (+17 more)

### Community 4 - "Media Generation"
Cohesion: 0.10
Nodes (14): decrypt_credential(), encrypt_credential(), encryption_key(), run(), _font(), generate_image(), generate_media(), _lines() (+6 more)

### Community 5 - "Meta Advertising"
Cohesion: 0.13
Nodes (22): account_path(), ad_account(), assets(), create_ad(), create_ad_set(), create_campaign(), create_creative(), custom_audiences() (+14 more)

### Community 6 - "Research Pipeline"
Cohesion: 0.13
Nodes (18): build_research_graph(), search(), synthesize(), ResearchState, parse_model_json(), ResearchError, Evidence, EvidenceChoice (+10 more)

### Community 7 - "Agent Orchestration"
Cohesion: 0.13
Nodes (18): plan(), execute_step(), creator_node(), master_node(), research_node(), checkpoint(), scheduler_node(), script_node() (+10 more)

### Community 8 - "API Error Handling"
Cohesion: 0.11
Nodes (9): health(), http_error(), meta_error(), require_service_token(), research_error(), unexpected_error(), validation_error(), value_error() (+1 more)

### Community 9 - "Authentication"
Cohesion: 0.32
Nodes (9): callback(), csrf_for(), current_user(), digest(), google_client(), login(), logout(), session() (+1 more)

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Contract` connect `Campaign Schemas` to `Content Creation`, `API Operations`, `Analytics Agents`, `Research Pipeline`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Are the 57 inferred relationships involving `transaction()` (e.g. with `sync()` and `sync_campaign()`) actually correct?**
  _`transaction()` has 57 INFERRED edges - model-reasoned connections that need verification._
- **Should `Content Creation` be split into smaller, more focused modules?**
  _Cohesion score 0.05389942788316772 - nodes in this community are weakly interconnected._
- **Why does `transaction()` connect `API Operations` to `Content Creation`, `Analytics Agents`, `Meta Advertising`, `Agent Orchestration`, `Authentication`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Are the 53 inferred relationships involving `table()` (e.g. with `sync_campaign()` and `context()`) actually correct?**
  _`table()` has 53 INFERRED edges - model-reasoned connections that need verification._
- **Should `API Operations` be split into smaller, more focused modules?**
  _Cohesion score 0.07894736842105263 - nodes in this community are weakly interconnected._
- **Why does `get_settings()` connect `Authentication` to `Content Creation`, `API Operations`, `Analytics Agents`, `Media Generation`, `Meta Advertising`, `Agent Orchestration`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._