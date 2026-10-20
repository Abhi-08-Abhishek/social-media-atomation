import math
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.auth import current_user
from app.db import transaction, table, owned_campaign, now
from app.integrations import zernio
from app.schemas.research import Contract
from app.policy import METRICS, summarize_metrics
from app.agents.recommendation import recommend

router = APIRouter(prefix="/api/analytics")


def normalize_metrics(data):
    status = str(data.get("status", "")).upper()
    if status not in {"PUBLISHED", "FAILED", "SCHEDULED", "QUEUED", "PUBLISHING", "DRAFT", "PARTIAL"}:
        raise ValueError("Zernio returned an unsupported publishing status.")
    metrics = data.get("analytics") or {}
    result = {}
    for name in METRICS:
        value = metrics.get(name)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0):
            raise ValueError("Zernio returned invalid metrics.")
        result[name] = round(value) if value is not None else None
    return result, status if status in {"PUBLISHED", "FAILED"} else "SCHEDULED"


async def sync_campaign(campaign_id, http):
    c, p, m, a, t, r = [table(name) for name in ("Campaign", "Post", "PostMetric", "AgentPlan", "AgentTask", "StrategyReport")]
    async with transaction() as db:
        campaign = await db.one(select(c).where(c.c.id == campaign_id))
        pending = await db.rows(select(p).where(p.c.campaignId == campaign_id, p.c.zernioPostId.is_not(None)).order_by(p.c.updatedAt).limit(40))
    key = await zernio.user_key(campaign["userId"]) if pending else ""
    updates, errors = [], []
    for post in pending:
        try:
            data = await zernio.request(http, key, "GET", "/analytics", params={"postId": post["zernioPostId"]})
            metrics, status = normalize_metrics(data)
            live = data.get("platformPostUrl") if isinstance(data.get("platformPostUrl"), str) else None
            async with transaction() as db:
                values = metrics | {"providerStatus": data["status"], "liveUrl": live, "observedAt": now()}
                await db.connection.execute(insert(m).values(id=str(uuid4()), postId=post["id"], **values).on_conflict_do_update(index_elements=[m.c.postId], set_=values))
                values = {"status": status, "liveUrl": live}
                if data.get("publishedAt"):
                    from app.policy import local_datetime
                    values["publishedAt"] = local_datetime(data["publishedAt"], "UTC")
                await db.update("Post", p.c.id == post["id"], values)
            updates.append({"id": post["id"], "status": status, "liveUrl": live})
        except Exception:
            errors.append({"postId": post["id"], "message": "Provider analytics could not be synchronized for this post."})
    async with transaction() as db:
        posts = await db.rows(select(p).where(p.c.campaignId == campaign_id).order_by(p.c.createdAt))
        rows = await db.rows(select(m).where(m.c.postId.in_([post["id"] for post in posts]))) if posts else []
        plans = await db.rows(select(a).where(a.c.campaignId == campaign_id, a.c.status == "waiting_for_metrics").order_by(a.c.createdAt))
        previous = await db.one(select(r).where(r.c.campaignId == campaign_id).order_by(r.c.createdAt.desc()).limit(1))
    by_post = {row["postId"]: row for row in rows}
    measured = [post for post in posts if post["status"] == "PUBLISHED" and post["id"] in by_post and any(by_post[post["id"]][k] is not None for k in METRICS)]
    summary = summarize_metrics([by_post[post["id"]] for post in measured])
    strategy_report, strategy_error = None, None
    if measured and campaign["optimizationEnabled"]:
        strategy_report, strategy_error = await recommend(http, campaign, measured, by_post, plans)
    async with transaction() as db:
        for plan in plans:
            own = [post for post in measured if post["planId"] == plan["id"]]
            own_posts = [post for post in posts if post["planId"] == plan["id"]]
            own_ids = {post["id"] for post in own_posts}
            own_errors = [error for error in errors if error["postId"] in own_ids]
            resolved = bool(own_posts) and all(post["status"] in {"PUBLISHED", "FAILED"} for post in own_posts)
            measured_all = resolved and bool(own) and len(own) == sum(post["status"] == "PUBLISHED" for post in own_posts)
            covered = bool(strategy_report) and {post["id"] for post in own}.issubset(set(strategy_report["sourcePostIds"]))
            all_failed = resolved and not any(post["status"] == "PUBLISHED" for post in own_posts)
            await db.update("AgentTask", (t.c.planId == plan["id"]) & (t.c.agentType == "ANALYTICS"),
                {"status": "done" if measured_all else "failed" if all_failed or own_errors else "pending",
                 "outputData": summarize_metrics([by_post[post["id"]] for post in own]) | {"sourcePostIds": [post["id"] for post in own], "syncErrors": own_errors}})
            strategy_done = measured_all and (covered or not campaign["optimizationEnabled"])
            await db.update("AgentTask", (t.c.planId == plan["id"]) & (t.c.agentType == "STRATEGIST"), {
                "status": "done" if strategy_done else "failed" if strategy_error or all_failed else "pending",
                "outputData": {"reportId": strategy_report["id"], "sourcePostIds": strategy_report["sourcePostIds"], **strategy_report["recommendations"]}
                    if strategy_done and covered and campaign["optimizationEnabled"] else {"reason": strategy_error or ("Optimization is disabled." if not campaign["optimizationEnabled"] else "Waiting for this run's measured results.")}})
            await db.update("AgentPlan", a.c.id == plan["id"], {
                "status": "failed" if all_failed else "completed" if strategy_done else "waiting_for_metrics",
                "currentStep": "STRATEGIST" if measured_all else "ANALYTICS",
                "errorMessage": "All posts in this run failed to publish. Review their provider status." if all_failed else None})
    published = sum(post["status"] == "PUBLISHED" for post in posts)
    resolved = sum(post["status"] in {"PUBLISHED", "FAILED"} for post in posts)
    return summary | {"averageEngagementRate": summary["engagementRate"], "totalPublished": published,
        "publishingSuccessRate": published / resolved * 100 if resolved else None, "updatedPosts": updates, "syncErrors": errors,
        "strategyReport": strategy_report or previous, "strategyError": strategy_error,
        "strategyReportStale": bool(previous and not strategy_report), "lastSyncedAt": max((row["observedAt"] for row in rows), default=None)}


class SyncRequest(Contract):
    campaignId: str = Field(min_length=1)


@router.post("/sync")
async def sync(body: SyncRequest, request: Request, user=Depends(current_user)):
    async with transaction() as db:
        await owned_campaign(db, body.campaignId, user["id"])
    return {"success": True, **await sync_campaign(body.campaignId, request.app.state.http)}
