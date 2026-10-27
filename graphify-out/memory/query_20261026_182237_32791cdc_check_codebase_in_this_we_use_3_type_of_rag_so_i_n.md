---
type: "query"
date: "2026-10-26T18:22:37.878371+00:00"
question: "check codebase in this we use 3 type of rag so i need to add data in that so suggest me the data for it"
contributor: "graphify"
outcome: "useful"
source_nodes: ["skills.py", "select_skill_context()", "build_research_graph()", "context()", "recommend()", "BrandProfile"]
---

# Q: check codebase in this we use 3 type of rag so i need to add data in that so suggest me the data for it

## Answer

Expanded from original query via vocab: [skill, skills, research, evidence, graph, context, brand, catalog, analytics, content, recommend, campaign]. The code has three retrieval/context paths: model-selected local SKILL.md files, Tavily web evidence with quote validation, and campaign database context from brand profile, recent posts, editorial feedback, and measured post analytics. Only SKILL.md is loaded from each skill directory; reference files are not loaded. Web search has no local corpus ingestion, and campaign memory is bounded structured context rather than vector RAG.

## Outcome

- Signal: useful

## Source Nodes

- skills.py
- select_skill_context()
- build_research_graph()
- context()
- recommend()
- BrandProfile