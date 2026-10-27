import asyncio
import contextlib
import json
from datetime import timedelta, timezone, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from langgraph.graph import StateGraph, START, END
from pydantic import Field
from sqlalchemy import select, or_, func

from app.auth import current_user
from app.config import get_settings
from app.db import transaction, table, owned_campaign, now
from app.schemas.content import Goal, Schedule, GeneratedPost
from app.schemas.research import Contract, ResearchRequest
from app.integrations.research import ResearchProviders, ResearchError
from app.integrations.zernio import user_key, accounts
from app.agents.research import run_research
from app.agents.creator import create_content
from app.media import generate_media
from app.agents.planner import create_brief
from app.policy import can_auto_publish, review
from app.publishing import publish
from app.workspace import serialize_plan

router = APIRouter(prefix="/api/agents")
TASKS = [("MASTER", "Understand the goal and prepare a brief"), ("RESEARCH", "Research current sources and evidence"),
         ("SCRIPT", "Write editable scripts for approval"), ("CREATOR", "Generate approved scripts"), ("SCHEDULER", "Schedule approved content"),
         ("ANALYTICS", "Measure published-post performance"), ("STRATEGIST", "Recommend the next content")]


def readiness_issues(settings):
    text_ready = any(all(values) for values in (
        (settings.groq_api_key.get_secret_value(), settings.groq_base_url, settings.groq_model),
        (settings.sensenova_api_key.get_secret_value(), settings.sensenova_base_url, settings.sensenova_model),
    ))
    cloudflare_ready = (len(settings.cloudflare_account_id) == 32
        and all(char in "0123456789abcdefABCDEF" for char in settings.cloudflare_account_id)
        and bool(settings.cloudflare_api_token.get_secret_value())
        and settings.cloudflare_image_model.startswith("@cf/")
        and not any(char in settings.cloudflare_image_model for char in "?#"))
    checks = [
        (text_ready, "Configure Groq or SenseNova."),
        (bool(settings.tavily_api_key.get_secret_value()), "Configure Tavily research."),
        (cloudflare_ready, "Configure Cloudflare image generation."),
        (bool(settings.imagekit_private_key.get_secret_value()), "Configure ImageKit media storage."),
        (bool(settings.zernio_base_url), "Configure the Zernio base URL."),
        (settings.publishing_enabled, "Enable publishing after migration verification."),
    ]
    return [message for ready, message in checks if not ready]


def unavailable_social_accounts(campaign, connected):
    active = {account["id"] for account in connected if account["isActive"]}
    return sorted(set(campaign["socialAccountIds"]) - active)


async def existing_plan(db, request_key, source):
    p = table("AgentPlan")
    return await db.one(select(p).where(or_(p.c.idempotencyKey == request_key,
        p.c.sourceRecommendation == source if source else False)))


@router.post("/master", status_code=202)
async def enqueue(body: Goal, request: Request, user=Depends(current_user)):
    key = await user_key(user["id"])
    request_key = str(body.idempotencyKey)
    source = f"{body.recommendation.reportId}:{body.recommendation.briefIndex}" if body.recommendation else None
    async with transaction() as db:
        campaign = await owned_campaign(db, body.campaignId, user["id"], True)
        existing = await existing_plan(db, request_key, source)
        if existing:
            if existing["campaignId"] != campaign["id"]:
                raise HTTPException(409, "This request key is already in use.")
            return {"success": True, "plan": {"planId": existing["id"], "status": existing["status"]}}
    issues = readiness_issues(get_settings())
    if issues:
        raise HTTPException(503, "Campaign automation is not ready: " + " ".join(issues))
    connected = await accounts(request.app.state.http, key)
    async with transaction() as db:
        campaign = await owned_campaign(db, body.campaignId, user["id"], True)
        p = table("AgentPlan")
        c = table("Campaign")
        await db.one(select(c.c.id).where(c.c.id == campaign["id"]).with_for_update())
        existing = await existing_plan(db, request_key, source)
        if existing:
            if existing["campaignId"] != campaign["id"]:
                raise HTTPException(409, "This request key is already in use.")
            return {"success": True, "plan": {"planId": existing["id"], "status": existing["status"]}}
        unavailable = unavailable_social_accounts(campaign, connected)
        if unavailable:
            raise HTTPException(409, "Reconnect or replace unavailable Zernio campaign accounts: " + ", ".join(unavailable))
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
        plan = await db.insert("AgentPlan", {"campaignId": campaign["id"], "idempotencyKey": request_key,
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


def retry_output(value):
    output = dict(value) if isinstance(value, dict) else {}
    error = output.pop("error", None)
    if error:
        output["lastError"] = error
    return output


@router.post("/run", status_code=202)
async def retry(body: Retry, user=Depends(current_user)):
    retrying_agent = None
    async with transaction() as db:
        plan = await owned_plan(db, body.planId, user["id"])
        await owned_campaign(db, plan["campaignId"], user["id"], True)
        p, t = table("AgentPlan"), table("AgentTask")
        if body.retry and plan["status"] == "failed":
            failed = await db.rows(select(t).where(t.c.planId == plan["id"], t.c.status == "failed").order_by(t.c.orderIndex))
            retrying_agent = plan["currentStep"] or (failed[0]["agentType"] if failed else None)
            resumed = await db.update("AgentPlan", (p.c.id == plan["id"]) & or_(p.c.leaseUntil.is_(None), p.c.leaseUntil < now()),
                {"status": "in_progress", "errorMessage": None, "currentStep": retrying_agent})
            if not resumed.rowcount:
                raise HTTPException(409, "This workflow is still running. Wait for the current attempt to finish.")
            for task in failed:
                await db.update("AgentTask", t.c.id == task["id"],
                    {"status": "pending", "outputData": retry_output(task["outputData"])})
    return {"success": True, "retryingAgent": retrying_agent}


class ScriptEdit(Contract):
    expectedVersion: int = Field(ge=1, strict=True)
    content: GeneratedPost


async def locked_script_task(db, plan_id, user_id):
    await owned_plan(db, plan_id, user_id)
    t = table("AgentTask")
    task = await db.one(select(t).where(t.c.planId == plan_id, t.c.agentType == "SCRIPT").with_for_update())
    if not task:
        raise HTTPException(404, "Script task not found.")
    return task


def find_script(task, script_id):
    output = task["outputData"] if isinstance(task["outputData"], dict) else {}
    scripts = list(output.get("scripts") or [])
    index = next((i for i, item in enumerate(scripts) if item.get("id") == script_id), None)
    if index is None:
        raise HTTPException(404, "Script not found.")
    return output, scripts, index


@router.patch("/plans/{plan_id}/scripts/{script_id}")
async def edit_script(plan_id: str, script_id: str, body: ScriptEdit, user=Depends(current_user)):
    async with transaction() as db:
        task = await locked_script_task(db, plan_id, user["id"])
        output, scripts, index = find_script(task, script_id)
        script = scripts[index]
        if script["status"] != "DRAFT":
            raise HTTPException(409, "Only draft scripts can be edited.")
        if script["version"] != body.expectedVersion:
            raise HTTPException(409, "This script changed in another session. Reload it before saving.")
        if body.content.platform != script["content"]["platform"] or body.content.format != script["content"]["format"]:
            raise HTTPException(400, "A script's platform and format cannot be changed.")
        source_urls = [str(url) for url in body.content.sourceUrls]
        scripts[index] = script | {"content": body.content.model_dump(mode="json"), "version": script["version"] + 1,
            "qualityReview": review(["This script was edited. Review the generated media and wording before scheduling."], source_urls),
            "updatedAt": now().isoformat()}
        await db.update("AgentTask", table("AgentTask").c.id == task["id"], {"outputData": output | {"scripts": scripts}})
    return {"script": scripts[index]}


@router.post("/plans/{plan_id}/scripts/{script_id}/approve")
async def approve_script(plan_id: str, script_id: str, user=Depends(current_user)):
    async with transaction() as db:
        task = await locked_script_task(db, plan_id, user["id"])
        output, scripts, index = find_script(task, script_id)
        script = scripts[index]
        if script["status"] == "GENERATED":
            return {"script": script}
        if script["status"] != "DRAFT":
            raise HTTPException(409, "Only draft scripts can be approved.")
        scripts[index] = script | {"status": "APPROVED", "approvedAt": now().isoformat(), "updatedAt": now().isoformat()}
        await db.update("AgentTask", table("AgentTask").c.id == task["id"], {"outputData": output | {"scripts": scripts}})
        p = table("AgentPlan")
        await db.update("AgentPlan", p.c.id == plan_id, {"status": "in_progress", "currentStep": "CREATOR", "leaseUntil": None})
    return {"script": scripts[index]}


def next_step(tasks, approval, posts):
    done = {t["agentType"] for t in tasks if t["status"] == "done"}
    for role in ("MASTER", "RESEARCH"):
        if role not in done:
            return role
    script_task = next((t for t in tasks if t["agentType"] == "SCRIPT"), None)
    if script_task:
        if script_task["status"] != "done":
            return "SCRIPT"
        scripts = (script_task["outputData"] or {}).get("scripts", [])
        if any(script["status"] == "APPROVED" for script in scripts):
            return "CREATOR"
        if any(script["status"] == "DRAFT" for script in scripts):
            return "SCRIPT_REVIEW"
    elif "CREATOR" not in done:  # Existing plans created before the Script Agent deployment.
        return "CREATOR"
    if any(not p["zernioPostId"] for p in posts):
        if approval == "REVIEW" or any(not can_auto_publish(p["qualityReview"]) for p in posts if not p["zernioPostId"]):
            return "REVIEW"
        return "SCHEDULER"
    return "FINISH"


def planned_deliverable(plan, campaign, index):
    deliverables = (plan.get("brief") or {}).get("deliverables") or []
    if index < len(deliverables):
        item = deliverables[index]
        if item.get("platform") in campaign["platforms"] and item.get("format") in {"Single Post", "Carousel", "Reel"}:
            return item
    return {"platform": campaign["platforms"][index % len(campaign["platforms"])], "format": None,
            "topic": "", "objective": ""}


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
    if step in {"SCRIPT_REVIEW", "REVIEW", "FINISH"}:
        async with transaction() as db:
            await db.update("AgentPlan", p.c.id == plan["id"], {
                "status": "awaiting_script_approval" if step == "SCRIPT_REVIEW" else "awaiting_approval" if step == "REVIEW" else "waiting_for_metrics",
                "currentStep": "SCRIPT" if step == "SCRIPT_REVIEW" else "CREATOR" if step == "REVIEW" else "SCHEDULER",
                **({"approvalMode": "REVIEW"} if step == "REVIEW" else {}),
            })
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

    async def script_node(state):
        task = next(task for task in tasks if task["agentType"] == "SCRIPT")
        output = task["outputData"] if isinstance(task["outputData"], dict) else {}
        scripts = list(output.get("scripts") or [])
        if len(scripts) >= campaign["postCount"]:
            await task_state(plan["id"], "SCRIPT", "done", output | {"scripts": scripts})
            return state
        research = next(task["outputData"] for task in tasks if task["agentType"] == "RESEARCH")
        deliverable = planned_deliverable(plan, campaign, len(scripts))
        platform = deliverable["platform"]
        deliverable_instruction = " ".join(filter(None, [deliverable.get("topic"), deliverable.get("objective")]))
        draft = (await create_content(http, campaign, plan["userPrompt"], research, 1, [platform], deliverable.get("format"),
            instructions=plan["brief"]["creatorInstructions"] + f" Script {len(scripts) + 1} of {campaign['postCount']}; "
                f"deliverable: {deliverable_instruction}; choose an angle distinct from earlier scripts.",
            render=False))[0]
        content = GeneratedPost.model_validate({key: draft[key] for key in GeneratedPost.model_fields}).model_dump(mode="json")
        timestamp = now().isoformat()
        scripts.append({"id": "script_" + str(uuid4()), "status": "DRAFT", "version": 1,
            "content": content, "qualityReview": draft["qualityReview"], "createdAt": timestamp, "updatedAt": timestamp,
            "approvedAt": None, "generatedPostId": None})
        await task_state(plan["id"], "SCRIPT", "done" if len(scripts) >= campaign["postCount"] else "pending",
            output | {"scripts": scripts})
        return state

    async def creator_node(state):
        script_task = next((task for task in tasks if task["agentType"] == "SCRIPT"), None)
        if script_task:
            output = script_task["outputData"] if isinstance(script_task["outputData"], dict) else {}
            scripts = list(output.get("scripts") or [])
            index = next((i for i, item in enumerate(scripts) if item["status"] == "APPROVED"), None)
            if index is None:
                await task_state(plan["id"], "CREATOR", "done" if scripts and all(s["status"] == "GENERATED" for s in scripts) else "pending")
                return state
            script = scripts[index]
            content = GeneratedPost.model_validate(script["content"]).model_dump(mode="json")
            quality = dict(script.get("qualityReview") or {})
            urls = []
            try:
                urls = await generate_media(http, content, campaign)
                if content["format"] != "Single Post":
                    quality.setdefault("issues", []).append("Preview every slide or scene and check narration before scheduling.")
            except Exception as error:
                quality.setdefault("issues", []).append(f"Media generation failed: {error}")
            quality["status"] = "needs_review" if quality.get("issues") else "passed"
            post_id = "post_" + script["id"].removeprefix("script_")
            async with transaction() as db:
                existing = await db.one(select(table("Post").c.id).where(table("Post").c.id == post_id))
                if not existing:
                    await db.insert("Post", {k: content[k] for k in ("title", "caption", "hashtags", "format", "suggestedTimeSlot")} |
                        {"id": post_id, "campaignId": campaign["id"], "planId": plan["id"], "platforms": [content["platform"]],
                         "status": "DRAFT", "isAiGenerated": True, "mediaUrls": urls, "qualityReview": quality,
                         "publishRequestId": str(uuid4())})
                scripts[index] = script | {"status": "GENERATED", "generatedPostId": post_id, "updatedAt": now().isoformat()}
                await db.update("AgentTask", t.c.id == script_task["id"], {"outputData": output | {"scripts": scripts}})
                generated_ids = [s["generatedPostId"] for s in scripts if s.get("generatedPostId")]
                await db.update("AgentTask", (t.c.planId == plan["id"]) & (t.c.agentType == "CREATOR"),
                    {"status": "done" if all(s["status"] == "GENERATED" for s in scripts) else "pending",
                     "outputData": {"postIds": generated_ids}})
            return state
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
    for name, node in {"MASTER": master_node, "RESEARCH": research_node, "SCRIPT": script_node, "CREATOR": creator_node, "SCHEDULER": scheduler_node}.items():
        graph.add_node(name, node)
        graph.add_edge(name, END)
    graph.add_edge(START, "supervisor")
    graph.add_conditional_edges("supervisor", lambda state: step, {name: name for name in ("MASTER", "RESEARCH", "SCRIPT", "CREATOR", "SCHEDULER")})
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
            await db.insert("AgentMessage", {"campaignId": campaign["id"], "sender": "MASTER", "metadata": {"planId": plan_id, "step": step},
                "content": "Scripts are ready for your review in the Script Agent." if step == "SCRIPT_REVIEW" else
                    "Drafts are ready for your review in Posts." if step == "REVIEW" else
                    "Scheduling is complete. Waiting for published-post metrics." if step == "FINISH" else
                    "An approved script was generated. Continuing any remaining work." if step == "CREATOR" else
                    "A script was saved. Continuing any remaining scripts." if step == "SCRIPT" else
                    "Your content plan is ready. Research is starting." if step == "MASTER" else f"{step.title()} step completed."})
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
