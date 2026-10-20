import json
from datetime import timezone
from zoneinfo import ZoneInfo
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field, HttpUrl
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert

from app.auth import current_user
from app.config import get_settings
from app.credentials import encrypt_credential
from app.db import transaction, table, owned_campaign, now
from app.integrations.zernio import accounts, user_key
from app.policy import review, summarize_metrics
from app.schemas.content import CampaignCreate, CampaignUpdate, Draft, Recommendation
from app.schemas.research import Contract

router = APIRouter(prefix="/api")


def serialize_plan(plan, tasks):
    return {"id": plan["id"], "title": plan["title"], "createdAt": plan["createdAt"],
        "status": plan["status"], "errorMessage": plan["errorMessage"],
        "progressPercent": round(sum(t["status"] == "done" for t in tasks) / len(tasks) * 100) if tasks else 0,
        "tasks": [{"id": t["id"], "title": t["title"], "assignedAgent": t["agentType"], "status": t["status"],
                   "order": t["orderIndex"], "detail": json.dumps(t["outputData"], ensure_ascii=False) if t["outputData"] else None} for t in tasks]}


def serialize_campaign(campaign, posts):
    published = sum(p["status"] == "PUBLISHED" for p in posts)
    return {k: v for k, v in campaign.items() if k not in {"userId"}} | {
        "progress": min(100, round(published / max(1, campaign["postCount"], len(posts)) * 100)),
        "publishedCount": published, "scheduledCount": sum(p["status"] == "SCHEDULED" for p in posts),
        "draftCount": sum(p["status"] == "DRAFT" for p in posts), "totalCount": len(posts)}


async def workspace(db, campaign):
    p, m, ap, at, sr, rd, am = [table(n) for n in ("Post", "PostMetric", "AgentPlan", "AgentTask", "StrategyReport", "RecommendationDecision", "AgentMessage")]
    posts = await db.rows(select(p).where(p.c.campaignId == campaign["id"]).order_by(p.c.createdAt.desc()))
    metrics = await db.rows(select(m).where(m.c.postId.in_([post["id"] for post in posts]))) if posts else []
    by_post = {item["postId"]: item for item in metrics}
    plans = await db.rows(select(ap).where(ap.c.campaignId == campaign["id"]).order_by(ap.c.createdAt.desc()).limit(20))
    tasks = await db.rows(select(at).where(at.c.planId.in_([plan["id"] for plan in plans])).order_by(at.c.orderIndex)) if plans else []
    reports = await db.rows(select(sr).where(sr.c.campaignId == campaign["id"]).order_by(sr.c.createdAt.desc()).limit(10))
    decisions = await db.rows(select(rd).where(rd.c.reportId.in_([r["id"] for r in reports]))) if reports else []
    messages = await db.rows(select(am.c.id, am.c.sender, am.c.content, am.c.createdAt).where(am.c.campaignId == campaign["id"]).order_by(am.c.createdAt.desc()).limit(100))
    published = [post for post in posts if post["status"] == "PUBLISHED"]
    measured = [by_post[post["id"]] for post in published if post["id"] in by_post]
    summary = summarize_metrics(measured)
    resolved = [post for post in posts if post["status"] in {"PUBLISHED", "FAILED"}]
    ui_posts = []
    for post in posts:
        ui_posts.append({"id": post["id"], "title": post["title"], "caption": post["caption"], "hashtags": post["hashtags"],
            "platform": post["platforms"][0], "format": post["format"], "status": post["status"],
            "imageUrl": next(iter(post["mediaUrls"]), None), "mediaUrls": post["mediaUrls"], "metrics": by_post.get(post["id"]),
            "scheduledTime": post["scheduledAt"].replace(tzinfo=timezone.utc).isoformat() if post["scheduledAt"] else None,
            "calendarDay": post["scheduledAt"].replace(tzinfo=timezone.utc).astimezone(ZoneInfo(campaign["timezone"])).day if post["scheduledAt"] else None,
            "timeSlot": post["suggestedTimeSlot"], "isAiGenerated": post["isAiGenerated"], "qualityReview": post["qualityReview"],
            "zernioPostId": post["zernioPostId"], "publishingStatus": post["status"], "liveUrl": post["liveUrl"]})
    return {"campaign": serialize_campaign(campaign, posts), "posts": ui_posts, "messages": list(reversed(messages)),
        "plans": [serialize_plan(plan, [t for t in tasks if t["planId"] == plan["id"]]) for plan in plans],
        "strategyReports": [r | {"decisions": [{"briefIndex": d["briefIndex"], "status": d["status"]} for d in decisions if d["reportId"] == r["id"]]} for r in reports],
        "analyticsMetrics": {"lastSyncedAt": max((m["observedAt"] for m in measured), default=None),
            "totalPublished": len(published), "totalViews": summary["totalViews"], "totalReach": summary["totalReach"],
            "averageEngagementRate": summary["engagementRate"],
            "publishingSuccessRate": round(len(published) / len(resolved) * 100) if resolved else None}}


@router.get("/campaigns")
async def list_campaigns(user=Depends(current_user)):
    async with transaction() as db:
        c, p = table("Campaign"), table("Post")
        campaigns = await db.rows(select(c).where(c.c.userId == user["id"], c.c.status == "active").order_by(c.c.updatedAt.desc()))
        posts = await db.rows(select(p.c.campaignId, p.c.status).where(p.c.campaignId.in_([c["id"] for c in campaigns]))) if campaigns else []
    return {"campaigns": [serialize_campaign(c, [p for p in posts if p["campaignId"] == c["id"]]) for c in campaigns]}


@router.post("/campaigns", status_code=201)
async def create_campaign(body: CampaignCreate, request: Request, user=Depends(current_user)):
    connected = await accounts(request.app.state.http, await user_key(user["id"]))
    selected = [a for a in connected if a["isActive"] and a["id"] in body.socialAccountIds]
    if {a["id"] for a in selected} != set(body.socialAccountIds):
        raise HTTPException(400, "One or more selected accounts are unavailable.")
    platforms = list(dict.fromkeys(a["platform"] for a in selected))
    if any(p not in {"INSTAGRAM", "FACEBOOK", "LINKEDIN", "X", "TIKTOK", "YOUTUBE"} for p in platforms):
        raise HTTPException(400, "Unsupported campaign platform.")
    async with transaction() as db:
        t = table("SocialAccount")
        for a in selected:
            data = {"id": str(uuid4()), "userId": user["id"], "accountId": a["id"], "platform": a["platform"],
                    "handle": a["username"], "isConnected": True, "createdAt": now(), "updatedAt": now()}
            await db.connection.execute(insert(t).values(**data).on_conflict_do_update(index_elements=[t.c.userId, t.c.accountId],
                set_={k: data[k] for k in ("platform", "handle", "isConnected", "updatedAt")}))
        campaign = await db.insert("Campaign", body.model_dump() | {"userId": user["id"], "platforms": platforms, "status": "active", "tone": "", "postingCadence": ""})
    return {"campaign": serialize_campaign(campaign, [])}


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, user=Depends(current_user)):
    async with transaction() as db:
        return await workspace(db, await owned_campaign(db, campaign_id, user["id"]))


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, body: CampaignUpdate, user=Depends(current_user)):
    async with transaction() as db:
        await owned_campaign(db, campaign_id, user["id"])
        await db.update("Campaign", table("Campaign").c.id == campaign_id, body.model_dump(exclude_unset=True))
    return {"success": True}


@router.delete("/campaigns/{campaign_id}")
async def end_campaign(campaign_id: str, user=Depends(current_user)):
    return await update_campaign(campaign_id, CampaignUpdate(status="ended"), user)


async def owned_post(db, post_id, user_id, provider=False):
    p, c = table("Post"), table("Campaign")
    row = await db.one(select(p).select_from(p.join(c, p.c.campaignId == c.c.id)).where(
        (p.c.zernioPostId if provider else p.c.id) == post_id, c.c.userId == user_id))
    if not row:
        raise HTTPException(404, "Post not found.")
    return row


@router.post("/posts")
async def save_draft(body: Draft, user=Depends(current_user)):
    async with transaction() as db:
        await owned_campaign(db, body.campaignId, user["id"], True)
        data = body.model_dump(mode="json", exclude={"campaignId", "postId", "platform", "qualityReview"}) | {
            "platforms": [body.platform], "status": "DRAFT", "scheduledAt": None, "publishedAt": None, "liveUrl": None}
        if body.postId:
            post = await owned_post(db, body.postId, user["id"])
            if post["campaignId"] != body.campaignId:
                raise HTTPException(404, "Post not found.")
            if post["zernioPostId"]:
                raise HTTPException(409, "Unschedule this post before saving a draft.")
            changed = any(post[k] != data[k] for k in ("title", "caption", "hashtags", "platforms", "format", "mediaUrls"))
            if changed:
                data["qualityReview"] = review(["This draft was edited. Review it before scheduling."], (post["qualityReview"] or {}).get("sourceUrls", []))
                data["editorialFeedback"] = {"action": "edited", "before": post["caption"][:800], "after": body.caption[:800], "at": now().isoformat()}
            await db.update("Post", table("Post").c.id == post["id"], data)
        else:
            post = await db.insert("Post", data | {"id": "post_" + str(uuid4()), "campaignId": body.campaignId,
                "publishRequestId": str(uuid4()), "qualityReview": review(["Review this manually saved draft before scheduling."],
                    [str(s) for s in body.qualityReview.sourceUrls] if body.qualityReview else [])})
    return {"success": True, "postId": post["id"]}


class MediaEdit(Contract):
    mediaUrl: HttpUrl


@router.patch("/posts/{post_id}")
async def update_media(post_id: str, body: MediaEdit, user=Depends(current_user)):
    async with transaction() as db:
        post = await owned_post(db, post_id, user["id"])
        if post["zernioPostId"]:
            raise HTTPException(409, "Unschedule the post before changing its image.")
        await db.update("Post", table("Post").c.id == post_id, {"mediaUrls": [str(body.mediaUrl), *post["mediaUrls"][1:]],
            "qualityReview": review(["The image changed. Review it before scheduling."])})
    return {"success": True}


class Feedback(Contract):
    reason: str = Field(pattern=r"^(Too generic|Wrong tone|Facts need checking|Image needs work)$")


@router.post("/posts/{post_id}/feedback")
async def feedback(post_id: str, body: Feedback, user=Depends(current_user)):
    async with transaction() as db:
        post = await owned_post(db, post_id, user["id"])
        if post["zernioPostId"]:
            raise HTTPException(409, "Unschedule this post before requesting changes.")
        await db.update("Post", table("Post").c.id == post_id, {"editorialFeedback": {
            "action": "rejected", "reason": body.reason, "caption": post["caption"][:800], "at": now().isoformat()},
            "qualityReview": review([body.reason], (post["qualityReview"] or {}).get("sourceUrls", []))})
        if post["planId"]:
            await db.update("AgentPlan", table("AgentPlan").c.id == post["planId"], {"status": "awaiting_approval", "approvalMode": "REVIEW"})
    return {"success": True}


@router.get("/zernio/connection")
async def connection(user=Depends(current_user)):
    async with transaction() as db:
        u = table("User")
        row = await db.one(select(u.c.zernioCredential).where(u.c.id == user["id"]))
    return {"connected": bool(row and row["zernioCredential"])}


class ConnectKey(Contract):
    apiKey: str = Field(min_length=10, max_length=1000)


@router.put("/zernio/connection")
async def save_connection(body: ConnectKey, request: Request, user=Depends(current_user)):
    connected = await accounts(request.app.state.http, body.apiKey)
    encrypted = encrypt_credential(body.apiKey, user["id"], get_settings().credential_encryption_key.get_secret_value())
    async with transaction() as db:
        c = table("Campaign")
        campaigns = await db.rows(select(c.c.socialAccountIds).where(c.c.userId == user["id"]))
        ids = {a["id"] for a in connected}
        if any(set(c["socialAccountIds"]) - ids for c in campaigns):
            raise HTTPException(409, "Use a key for the same Zernio workspace as your existing campaigns.")
        await db.update("User", table("User").c.id == user["id"], {"zernioCredential": encrypted})
    return {"connected": True, "accountCount": sum(a["isActive"] for a in connected)}


@router.get("/zernio/accounts")
async def list_accounts(request: Request, user=Depends(current_user)):
    return {"accounts": await accounts(request.app.state.http, await user_key(user["id"]))}


@router.post("/recommendations")
async def dismiss(body: Recommendation, user=Depends(current_user)):
    async with transaction() as db:
        r = table("StrategyReport")
        report = await db.one(select(r).where(r.c.id == body.reportId))
        if not report:
            raise HTTPException(404, "Recommendation not found.")
        await owned_campaign(db, report["campaignId"], user["id"])
        if body.briefIndex >= len(report["recommendations"].get("nextContentBriefs", [])):
            raise HTTPException(404, "Recommendation not found.")
        t = table("RecommendationDecision")
        await db.connection.execute(insert(t).values(id=str(uuid4()), reportId=body.reportId, briefIndex=body.briefIndex,
            status="dismissed", createdAt=now()).on_conflict_do_nothing(index_elements=[t.c.reportId, t.c.briefIndex]))
    return {"success": True}
