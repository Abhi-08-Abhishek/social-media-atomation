"""Evidence-backed recommendations and cached strategy reports."""
import hashlib
import json
from collections import Counter
from uuid import uuid4

from pydantic import Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.config import get_settings
from app.db import transaction, table, now
from app.integrations.research import ResearchProviders
from app.schemas.research import Contract
from app.schemas.content import Platform, Format
from app.policy import METRICS
from app.skills import select_skill_context


class NextBrief(Contract):
    platform: Platform
    topic: str = Field(min_length=1, max_length=300)
    hook: str = Field(min_length=1, max_length=300)
    format: Format
    callToAction: str = Field(max_length=300)
    evidencePostIds: list[str] = Field(min_length=1, max_length=100)


class Strategy(Contract):
    summary: str = Field(min_length=1, max_length=2000)
    winningPatterns: list[str] = Field(max_length=10)
    weakPatterns: list[str] = Field(max_length=10)
    recommendedTopics: list[str] = Field(min_length=1, max_length=10)
    recommendedFormats: list[str] = Field(min_length=1, max_length=6)
    recommendedPostingWindows: list[str] = Field(max_length=10)
    experiments: list[str] = Field(min_length=1, max_length=10)
    nextContentBriefs: list[NextBrief] = Field(min_length=1, max_length=10)
    confidence: float = Field(ge=0, le=1)
    insufficientData: bool


def comparable_count(posts):
    groups = Counter()
    for post in posts:
        date = post.get("publishedAt")
        if not date:
            continue
        hours = (now() - date).total_seconds() / 3600
        if hours >= 24:
            groups[(post["platforms"][0], post["format"], "1-3" if hours < 72 else "3-7" if hours < 168 else "7+")] += 1
    return max(groups.values(), default=0)


async def recommend(http, campaign, measured, by_post, plans):
    campaign_id = campaign["id"]
    r = table("StrategyReport")
    strategy_report, strategy_error = None, None
    # Include the oldest waiting run so older posts cannot age out of report coverage.
    priority = [post for post in measured if plans and post["planId"] == plans[0]["id"]]
    priority_ids = {post["id"] for post in priority}
    recent = [post for post in measured if post["id"] not in priority_ids]
    sample = priority + (recent[-(100 - len(priority)):] if len(priority) < 100 else [])
    sample_data = [{k: post[k] for k in ("id", "platforms", "format", "title", "caption", "publishedAt", "scheduledAt")} |
                   {k: by_post[post["id"]][k] for k in METRICS} for post in sample]
    fingerprint = hashlib.sha256(json.dumps({"coverageVersion": 2, "posts": sample_data}, default=str, sort_keys=True).encode()).hexdigest()
    async with transaction() as db:
        strategy_report = await db.one(select(r).where(r.c.campaignId == campaign_id, r.c.metricsFingerprint == fingerprint))
    if not strategy_report:
        try:
            providers = ResearchProviders(get_settings(), http)
            skills = await select_skill_context(providers, json.dumps({
                "agent": "growth strategist", "campaign": campaign["name"],
                "platforms": campaign["platforms"], "measuredPostCount": len(sample_data),
                "task": "Analyze measured social performance and recommend the next experiments.",
            }, default=str))
            result = await providers.structured("growth_strategy",
                skills + "\n\nAnalyze only supplied measured posts. Null metrics are unavailable, never zero. Compare within the same platform, "
                "format and publication-age band. Cite supplied post IDs for every proposed brief. Use only selected platforms. "
                "Optimize recommendations for the supplied campaign targetMetric. "
                "Do not invent demographics, conversions or competitor data. Small samples need experiments, not winning claims. "
                "Use the campaign timezone for posting windows. Recommendations require user approval; do not schedule them.",
                json.dumps({"campaign": {k: campaign[k] for k in ("name", "brandDescription", "targetAudience", "platforms", "timezone", "objective", "targetMetric")},
                    "posts": sample_data, "evaluatedAt": now()}, default=str), Strategy)
            valid_ids = {post["id"] for post in sample}
            if any(b.platform not in campaign["platforms"] or set(b.evidencePostIds) - valid_ids for b in result.nextContentBriefs):
                raise ValueError("Strategy cited unsupported evidence or platforms.")
            if comparable_count(sample) < 3:
                result.insufficientData, result.confidence, result.winningPatterns = True, min(result.confidence, .4), []
            async with transaction() as db:
                await db.connection.execute(insert(r).values(id=str(uuid4()), campaignId=campaign_id, metricsFingerprint=fingerprint,
                    summary=result.summary, recommendations=result.model_dump() | {"measurementWindow": {
                        "from": min(by_post[post["id"]]["observedAt"] for post in sample).isoformat() + "Z",
                        "to": max(by_post[post["id"]]["observedAt"] for post in sample).isoformat() + "Z"}}, confidence=result.confidence,
                    insufficientData=result.insufficientData, sourcePostIds=sorted(valid_ids),
                    createdAt=now()).on_conflict_do_nothing(index_elements=[r.c.campaignId, r.c.metricsFingerprint]))
                strategy_report = await db.one(select(r).where(r.c.campaignId == campaign_id, r.c.metricsFingerprint == fingerprint))
                await db.insert("AgentMessage", {"campaignId": campaign_id, "sender": "MASTER", "content": "Performance review: " + result.summary + " Review recommendations in Analytics and approve what to create next.", "metadata": {"strategyReportId": strategy_report["id"]}})
        except Exception:
            strategy_error = "Strategy generation failed. Existing posts and metrics are preserved."
    return strategy_report, strategy_error
