import asyncio
import contextlib
import json
from datetime import timedelta, timezone, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from langgraph.graph import StateGraph, START, END
from pydantic import Field
from sqlalchemy import select, or_, func

from app.auth import current_user
from app.config import get_settings
from app.db import transaction, table, owned_campaign, now
from app.schemas.content import Goal, Schedule
from app.schemas.research import Contract, ResearchRequest
from app.integrations.research import ResearchProviders, ResearchError
from app.integrations.zernio import user_key
from app.agents.research import run_research
from app.agents.creator import create_content
from app.agents.planner import create_brief
from app.policy import can_auto_publish
from app.publishing import publish
from app.workspace import serialize_plan

router = APIRouter(prefix="/api/agents")
TASKS = [("MASTER", "Understand the goal and prepare a brief"), ("RESEARCH", "Research current sources and evidence"),
         ("CREATOR", "Write, render and review sourced drafts"), ("SCHEDULER", "Schedule approved content"),
         ("ANALYTICS", "Measure published-post performance"), ("STRATEGIST", "Recommend the next content")]


@router.post("/master", status_code=202)
async def enqueue(body: Goal, user=Depends(current_user)):
    await user_key(user["id"])
    async with transaction() as db:
        campaign = await owned_campaign(db, body.campaignId, user["id"], True)
        p = table("AgentPlan")
        # Lock campaign first: both duplicate request IDs and recommendation decisions are serialized.
        c = table("Campaign")
        await db.one(select(c.c.id).where(c.c.id == campaign["id"]).with_for_update())
        source = f"{body.recommendation.reportId}:{body.recommendation.briefIndex}" if body.recommendation else None
        existing = await db.one(select(p).where(or_(p.c.idempotencyKey == str(body.idempotencyKey), p.c.sourceRecommendation == source if source else False)))
        if existing:
            if existing["campaignId"] != campaign["id"]:
                raise HTTPException(409, "This request key is already in use.")
            return {"success": True, "plan": {"planId": existing["id"], "status": existing["status"]}}
        prompt = body.prompt
        if body.recommendation:
            r, d = table("StrategyReport"), table("RecommendationDecision")
            report = await db.one(select(r).where(r.c.id == body.recommendation.reportId, r.c.campaignId == campaign["id"]))
            briefs = (report or {}).get("recommendations", {}).get("nextContentBriefs", [])
            if body.recommendation.briefIndex >= len(briefs):
                raise HTTPException(404, "Recommendation not found.")
            decision = await db.one(select(d).where(d.c.reportId == report["id"], d.c.briefIndex == body.recommendation.briefIndex))
            if decision:
                raise HTTPException(409, "This recommendation already has a decision.")
            await db.insert("RecommendationDecision", body.recommendation.model_dump() | {"status": "approved", "editedBrief": prompt or None})
            prompt = prompt or "Create content from this approved recommendation: " + json.dumps(briefs[body.recommendation.briefIndex])
        approval = campaign["approvalMode"] if all(p in {"INSTAGRAM", "FACEBOOK", "LINKEDIN", "X"} for p in campaign["platforms"]) else "REVIEW"
        plan = await db.insert("AgentPlan", {"campaignId": campaign["id"], "idempotencyKey": str(body.idempotencyKey),
            "sourceRecommendation": source, "title": prompt[:120], "userPrompt": prompt, "brief": {}, "approvalMode": approval,
            "status": "in_progress", "currentStep": "MASTER"})
        for i, (role, title) in enumerate(TASKS):
            await db.insert("AgentTask", {"planId": plan["id"], "agentType": role, "title": title, "status": "pending", "orderIndex": i + 1})
        for sender, text in [("USER", prompt), ("MASTER", "Your brief is queued. " + ("Drafts will wait for your review." if approval == "REVIEW" else "Automatic scheduling is enabled for this campaign."))]:
            await db.insert("AgentMessage", {"campaignId": campaign["id"], "sender": sender, "content": text, "metadata": {"planId": plan["id"]}})
    return {"success": True, "plan": {"planId": plan["id"], "status": "in_progress"}}


async def owned_plan(db, plan_id, user_id):
    p = table("AgentPlan")
    plan = await db.one(select(p).where(p.c.id == plan_id))
    if not plan:
        raise HTTPException(404, "Plan not found.")
    await owned_campaign(db, plan["campaignId"], user_id)
    return plan


@router.get("/run")
async def progress(planId: str, user=Depends(current_user)):
    async with transaction() as db:
        plan = await owned_plan(db, planId, user["id"])
        t = table("AgentTask")
        tasks = await db.rows(select(t).where(t.c.planId == planId).order_by(t.c.orderIndex))
    return {"plan": serialize_plan(plan, tasks)}


class Retry(Contract):
    planId: str = Field(min_length=1)
    retry: bool = False


@router.post("/run", status_code=202)
async def retry(body: Retry, user=Depends(current_user)):
    async with transaction() as db:
        plan = await owned_plan(db, body.planId, user["id"])
        await owned_campaign(db, plan["campaignId"], user["id"], True)
        p = table("AgentPlan")
        if body.retry and plan["status"] == "failed":
            await db.update("AgentPlan", (p.c.id == plan["id"]) & or_(p.c.leaseUntil.is_(None), p.c.leaseUntil < now()),
                            {"status": "in_progress", "errorMessage": None})
    return {"success": True}


def next_step(tasks, approval, posts):
    done = {t["agentType"] for t in tasks if t["status"] == "done"}
    for role in ("MASTER", "RESEARCH", "CREATOR"):
        if role not in done:
            return role
    if any(not p["zernioPostId"] for p in posts):
        if approval == "REVIEW" or any(not can_auto_publish(p["qualityReview"]) for p in posts if not p["zernioPostId"]):
            return "REVIEW"
        return "SCHEDULER"
    return "FINISH"


async def task_state(plan_id, role, status, output=None):
    async with transaction() as db:
        t = table("AgentTask")
        data = {"status": status}
        if output is not None:
            data["outputData"] = output
        await db.update("AgentTask", (t.c.planId == plan_id) & (t.c.agentType == role), data)


async def execute_step(plan, campaign, tasks, posts, http):
    step = next_step(tasks, plan["approvalMode"], posts)
    p, t = table("AgentPlan"), table("AgentTask")
    if step in {"REVIEW", "FINISH"}:
        async with transaction() as db:
            await db.update("AgentPlan", p.c.id == plan["id"], {"status": "awaiting_approval" if step == "REVIEW" else "waiting_for_metrics",
                "currentStep": "CREATOR" if step == "REVIEW" else "SCHEDULER", **({"approvalMode": "REVIEW"} if step == "REVIEW" else {})})
        return step
    await task_state(plan["id"], step, "running")
    async with transaction() as db:
        await db.update("AgentPlan", p.c.id == plan["id"], {"currentStep": step})
    providers = ResearchProviders(get_settings(), http)

    async def master_node(state):
        brief = await create_brief(http, campaign, plan["userPrompt"], plan["approvalMode"])
        async with transaction() as db:
            await db.update("AgentPlan", p.c.id == plan["id"], {"brief": brief.model_dump(), "title": brief.title})
            await db.update("AgentTask", (t.c.planId == plan["id"]) & (t.c.agentType == "MASTER"), {"status": "done", "outputData": brief.model_dump()})
        return state

    async def research_node(state):
        old = next((task["outputData"] for task in tasks if task["agentType"] == "RESEARCH"), None) or {}
        async def checkpoint(data):
            await task_state(plan["id"], "RESEARCH", "running", {"checkpoint": data})
        result = await run_research(ResearchRequest(query=plan["userPrompt"] + "\n" + "; ".join(plan["brief"]["researchQuestions"])),
            providers, old.get("checkpoint"), checkpoint)
        await task_state(plan["id"], "RESEARCH", "done", result.model_dump(mode="json"))
        return state

    async def creator_node(state):
        if len(posts) >= campaign["postCount"]:
            await task_state(plan["id"], "CREATOR", "done")
            return state
        research = next(task["outputData"] for task in tasks if task["agentType"] == "RESEARCH")
        platform = campaign["platforms"][len(posts) % len(campaign["platforms"])]
        drafts = await create_content(http, campaign, plan["userPrompt"], research, 1, [platform],
            instructions=plan["brief"]["creatorInstructions"] + f" Draft {len(posts) + 1} of {campaign['postCount']}; choose an angle distinct from recent posts.")
        async with transaction() as db:
            for draft in drafts:
                await db.insert("Post", {k: draft[k] for k in ("id", "title", "caption", "hashtags", "format", "isAiGenerated", "mediaUrls", "qualityReview", "suggestedTimeSlot")} |
                    {"campaignId": campaign["id"], "planId": plan["id"], "platforms": [draft["platform"]], "status": "DRAFT", "publishRequestId": str(uuid4())})
            await db.update("AgentTask", (t.c.planId == plan["id"]) & (t.c.agentType == "CREATOR"),
                {"status": "done" if len(posts) + len(drafts) >= campaign["postCount"] else "pending",
                 "outputData": {"postIds": [post["id"] for post in posts] + [draft["id"] for draft in drafts]}})
        return state

    async def scheduler_node(state):
        post = next(post for post in posts if not post["zernioPostId"])
        if not can_auto_publish(post["qualityReview"]):
            raise ValueError("This post needs human review before scheduling.")
        zone = ZoneInfo(campaign["timezone"])
        local = datetime.now(zone) + timedelta(days=posts.index(post) + 1)
        slot = post["suggestedTimeSlot"] or "10:00 AM"
        try:
            parsed = datetime.strptime(slot, "%I:%M %p")
        except ValueError:
            parsed = datetime.strptime(slot, "%H:%M")
        if post["scheduledAt"]:
            intended = post["scheduledAt"].replace(tzinfo=timezone.utc).astimezone(zone)
        else:
            if post["publishAttemptAt"]:
                raise ValueError("An earlier publishing attempt has no saved schedule. Reconcile it in Zernio before retrying.")
            intended = local.replace(hour=parsed.hour, minute=parsed.minute, second=0, microsecond=0)
            async with transaction() as db:
                await db.update("Post", table("Post").c.id == post["id"],
                    {"scheduledAt": intended.astimezone(timezone.utc).replace(tzinfo=None)})
        when = intended.strftime("%Y-%m-%dT%H:%M")
        await publish(http, campaign["userId"], Schedule(campaignId=campaign["id"], localPostId=post["id"],
            title=post["title"], caption=post["caption"], hashtags=post["hashtags"], platform=post["platforms"][0],
            format=post["format"], mediaUrls=post["mediaUrls"], scheduledAt=when, timezone=campaign["timezone"], isAiGenerated=post["isAiGenerated"]), automatic=True)
        await task_state(plan["id"], "SCHEDULER", "pending" if sum(not p["zernioPostId"] for p in posts) > 1 else "done")
        return state

    # Each invocation executes one durable step; the supervisor re-evaluates persisted results next tick.
    graph = StateGraph(dict)
    graph.add_node("supervisor", lambda state: state)
    for name, node in {"MASTER": master_node, "RESEARCH": research_node, "CREATOR": creator_node, "SCHEDULER": scheduler_node}.items():
        graph.add_node(name, node)
        graph.add_edge(name, END)
    graph.add_edge(START, "supervisor")
    graph.add_conditional_edges("supervisor", lambda state: step, {name: name for name in ("MASTER", "RESEARCH", "CREATOR", "SCHEDULER")})
    await graph.compile().ainvoke({})
    return step


async def advance(plan_id, http):
    lease = now() + timedelta(minutes=10)
    p, c, t, post_table = [table(name) for name in ("AgentPlan", "Campaign", "AgentTask", "Post")]
    async with transaction() as db:
        claimed = await db.update("AgentPlan", (p.c.id == plan_id) & (p.c.status == "in_progress") &
            p.c.campaignId.in_(select(c.c.id).where(c.c.status == "active")) & or_(p.c.leaseUntil.is_(None), p.c.leaseUntil < now()), {"leaseUntil": lease})
        if not claimed.rowcount:
            return
        plan = await db.one(select(p).where(p.c.id == plan_id))
        campaign = await db.one(select(c).where(c.c.id == plan["campaignId"]))
        tasks = await db.rows(select(t).where(t.c.planId == plan_id))
        posts = await db.rows(select(post_table).where(post_table.c.planId == plan_id).order_by(post_table.c.createdAt))

    async def heartbeat():
        nonlocal lease
        while True:
            await asyncio.sleep(30)
            updated = now() + timedelta(minutes=10)
            async with transaction() as db:
                result = await db.update("AgentPlan", (p.c.id == plan_id) & (p.c.leaseUntil == lease), {"leaseUntil": updated})
                if not result.rowcount:
                    raise RuntimeError("Workflow lease was lost.")
            lease = updated

    beat = asyncio.create_task(heartbeat())
    work = asyncio.create_task(execute_step(plan, campaign, tasks, posts, http))
    try:
        done, _ = await asyncio.wait({beat, work}, timeout=1800, return_when=asyncio.FIRST_COMPLETED)
        if work not in done:
            work.cancel()
            if beat in done:
                beat.result()
            raise TimeoutError("Workflow step exceeded its execution budget.")
        step = work.result()
        async with transaction() as db:
            await db.insert("AgentMessage", {"campaignId": campaign["id"], "sender": "MASTER", "metadata": {"planId": plan_id},
                "content": "Drafts are ready for your review in Posts." if step == "REVIEW" else "Scheduling is complete. Waiting for published-post metrics." if step == "FINISH" else "A draft was saved. Continuing any remaining drafts." if step == "CREATOR" else f"{step.title()} step completed."})
    except Exception as error:
        message = str(error) if isinstance(error, (ValueError, ResearchError, HTTPException, TimeoutError)) else "Workflow step failed. Check the backend logs and retry."
        if isinstance(error, HTTPException):
            message = str(error.detail)
        async with transaction() as db:
            await db.update("AgentPlan", p.c.id == plan_id, {"status": "failed", "errorMessage": message})
            running = await db.rows(select(t).where(t.c.planId == plan_id, t.c.status == "running"))
            for task in running:
                previous = task["outputData"] if isinstance(task["outputData"], dict) else {}
                await db.update("AgentTask", t.c.id == task["id"], {"status": "failed", "outputData": previous | {"error": message}})
    finally:
        beat.cancel()
        work.cancel()
        for task in (beat, work):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        async with transaction() as db:
            await db.update("AgentPlan", (p.c.id == plan_id) & (p.c.leaseUntil == lease), {"leaseUntil": None})
