import hashlib
import json
from datetime import timedelta
from uuid import uuid4
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func

from app.auth import current_user
from app.config import get_settings
from app.db import transaction, table, owned_campaign, now
from app.integrations import zernio
from app.policy import local_datetime, validate_media, review
from app.schemas.content import Schedule, ScheduleUpdate
from app.workspace import owned_post

router = APIRouter(prefix="/api/zernio")


def publishing_allowed():
    if not get_settings().publishing_enabled:
        raise HTTPException(409, "Publishing is disabled during migration verification. Enable PUBLISHING_ENABLED after reviewing the cutover.")


def content(title, caption, tags):
    return "\n\n".join(p for p in (title, caption, " ".join("#" + tag.lstrip("#") for tag in tags)) if p)


async def publish(http, user_id, body: Schedule, *, automatic=False):
    publishing_allowed()
    urls = [str(url) for url in body.mediaUrls]
    validate_media(body.platform, body.format, urls)
    async with transaction() as db:
        campaign = await owned_campaign(db, body.campaignId, user_id, True)
    if body.timezone != campaign["timezone"] or body.platform not in campaign["platforms"]:
        raise HTTPException(400, "Choose the campaign timezone and a selected platform.")
    scheduled = local_datetime(body.scheduledAt, body.timezone)
    if scheduled <= now():
        raise HTTPException(400, "Choose a future publishing time.")
    key = await zernio.user_key(user_id)
    connected = await zernio.accounts(http, key)
    account = next((a for a in connected if a["isActive"] and a["platform"] == body.platform and a["id"] in campaign["socialAccountIds"]), None)
    if not account:
        raise HTTPException(400, "No selected publishing account is available for this platform.")
    platform = "twitter" if body.platform == "X" else body.platform.lower()
    payload = {"content": content(body.title, body.caption, body.hashtags),
        "mediaItems": [{"type": "video" if urlparse(url).path.lower().endswith((".mp4", ".mov", ".webm")) else "image", "url": url} for url in urls],
        "platforms": [{"platform": platform, "accountId": account["id"]}],
        "scheduledFor": body.scheduledAt, "timezone": body.timezone}
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    identity = body.localPostId or "post_" + str(body.requestId)
    async with transaction() as db:
        p = table("Post")
        # Serialize new/manual requests by identity without a separate lock service.
        await db.connection.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(identity, 0))))
        post = await db.one(select(p).where(p.c.id == identity).with_for_update())
        if post and post["campaignId"] != campaign["id"]:
            raise HTTPException(404, "Post not found.")
        if body.localPostId and not post:
            raise HTTPException(404, "Post not found.")
        if post and post["zernioPostId"]:
            raise HTTPException(409, "This post is already scheduled. Edit its existing schedule.")
        if not post:
            post = await db.insert("Post", {"id": identity, "campaignId": campaign["id"], "title": body.title,
                "caption": body.caption, "hashtags": body.hashtags, "platforms": [body.platform], "format": body.format,
                "mediaUrls": urls, "isAiGenerated": body.isAiGenerated, "status": "DRAFT", "publishRequestId": str(uuid4())})
        if post["publishAttemptAt"]:
            if now() - post["publishAttemptAt"] > timedelta(hours=23) or post["publishFingerprint"] != fingerprint:
                raise HTTPException(409, "An earlier publishing attempt needs reconciliation in Zernio before retrying or changing this post.")
        else:
            await db.update("Post", p.c.id == identity, {"publishAttemptAt": now(), "publishFingerprint": fingerprint})
    # Commit the attempt BEFORE the side effect so crashes/timeouts cannot erase its identity.
    try:
        data = await zernio.request(http, key, "POST", "/posts", json=payload,
            headers={"x-request-id": post["publishRequestId"], "Idempotency-Key": post["publishRequestId"]})
    except zernio.ZernioError as error:
        if error.status in {400, 401, 403, 404, 422}:
            async with transaction() as db:
                await db.update("Post", (p.c.id == identity) & p.c.zernioPostId.is_(None),
                    {"publishAttemptAt": None, "publishFingerprint": None, "publishRequestId": str(uuid4())})
        raise
    remote = data.get("post", data)
    remote_id = remote.get("_id") or remote.get("id")
    status = str(remote.get("status", "")).lower()
    if not remote_id or status not in {"scheduled", "published", "draft", "queued", "publishing", "partial"}:
        raise HTTPException(502, "Zernio did not confirm a valid post. Reconcile provider status before retrying.")
    live_url = remote.get("platformPostUrl") or next((p.get("platformPostUrl") for p in remote.get("platforms", []) if p.get("platformPostUrl")), None)
    async with transaction() as db:
        await db.update("Post", p.c.id == identity, {"title": body.title, "caption": body.caption,
            "hashtags": body.hashtags, "platforms": [body.platform], "format": body.format, "mediaUrls": urls,
            "isAiGenerated": body.isAiGenerated, "suggestedTimeSlot": body.scheduledAt[11:16],
            "zernioPostId": remote_id, "scheduledAt": scheduled, "status": "PUBLISHED" if status == "published" else "SCHEDULED",
            "publishedAt": now() if status == "published" else None, "liveUrl": live_url,
            "editorialFeedback": {"action": "auto_scheduled" if automatic else "approved",
                "actor": "quality_gate" if automatic else "user", "before": post["caption"][:800], "after": body.caption[:800], "at": now().isoformat()}})
        if post["planId"]:
            remaining = await db.one(select(func.count().label("count")).select_from(p).where(p.c.planId == post["planId"], p.c.zernioPostId.is_(None)))
            if remaining["count"] == 0:
                t = table("AgentTask")
                creator = await db.one(select(t.c.status).where(t.c.planId == post["planId"], t.c.agentType == "CREATOR"))
                if creator and creator["status"] == "done":
                    await db.update("AgentTask", (t.c.planId == post["planId"]) & (t.c.agentType == "SCHEDULER"), {"status": "done"})
                    await db.update("AgentPlan", table("AgentPlan").c.id == post["planId"], {"status": "waiting_for_metrics", "currentStep": "SCHEDULER"})
    return {"success": True, "postId": remote_id, "localPostId": identity, "status": status,
            "scheduledTime": remote.get("scheduledFor") or body.scheduledAt, "platform": body.platform, "liveUrl": live_url}


@router.post("/schedule")
async def schedule(body: Schedule, request: Request, user=Depends(current_user)):
    return await publish(request.app.state.http, user["id"], body)


@router.put("/schedule")
async def update_schedule(body: ScheduleUpdate, request: Request, user=Depends(current_user)):
    publishing_allowed()
    async with transaction() as db:
        post = await owned_post(db, body.postId, user["id"], True)
        campaign = await owned_campaign(db, post["campaignId"], user["id"])
    if body.timezone and body.timezone != campaign["timezone"]:
        raise HTTPException(400, "Choose the campaign timezone.")
    if not any(k in body.model_fields_set for k in {"title", "caption", "hashtags", "scheduledFor"}):
        raise HTTPException(400, "Provide an update.")
    title = body.title if body.title is not None else post["title"]
    caption = body.caption if body.caption is not None else post["caption"]
    hashtags = body.hashtags if body.hashtags is not None else post["hashtags"]
    payload = {"content": content(title, caption, hashtags), "title": title}
    scheduled = post["scheduledAt"]
    if body.scheduledFor:
        scheduled = local_datetime(body.scheduledFor, campaign["timezone"])
        if scheduled <= now():
            raise HTTPException(400, "Choose a future publishing time.")
        payload.update(scheduledFor=body.scheduledFor, timezone=campaign["timezone"])
    await zernio.request(request.app.state.http, await zernio.user_key(user["id"]), "PUT", zernio.post_path(body.postId), json=payload)
    async with transaction() as db:
        await db.update("Post", table("Post").c.id == post["id"], {"title": title, "caption": caption,
            "hashtags": hashtags, "scheduledAt": scheduled, "qualityReview": review(["The scheduled post was edited after review."]),
            "editorialFeedback": {"action": "edited", "before": post["caption"][:800], "after": caption[:800], "at": now().isoformat()}})
    return {"success": True}


@router.delete("/schedule")
async def cancel(postId: str, request: Request, user=Depends(current_user)):
    publishing_allowed()
    async with transaction() as db:
        post = await owned_post(db, postId, user["id"], True)
    await zernio.request(request.app.state.http, await zernio.user_key(user["id"]), "DELETE", zernio.post_path(postId))
    async with transaction() as db:
        await db.update("Post", table("Post").c.id == post["id"], {"status": "DRAFT", "zernioPostId": None,
            "scheduledAt": None, "publishedAt": None, "liveUrl": None, "publishAttemptAt": None, "publishFingerprint": None,
            "publishRequestId": str(uuid4()), "qualityReview": review(["Review this unscheduled draft before publishing again."])})
    return {"success": True}
