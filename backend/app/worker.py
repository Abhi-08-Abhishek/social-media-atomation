"""Persistent PostgreSQL queue consumer bundled with the local HTTP server."""
import asyncio
import logging
import time

import httpx
from sqlalchemy import select, or_
from app.config import get_settings
from app.db import connect, transaction, table, now
from app.agents.workflow import advance
from app.agents.analytics import sync_campaign
from app.agents.meta_ads import sync_campaign as sync_meta_campaign

log = logging.getLogger("socialix.worker")


async def run():
    await connect()
    last_analytics = {}
    last_meta_analytics = {}
    campaign_cursor = ""
    slots = asyncio.Semaphore(2)
    async with httpx.AsyncClient() as http:
        while True:
            try:
                async with transaction() as db:
                    p, c = table("AgentPlan"), table("Campaign")
                    candidates = await db.rows(select(p.c.id, p.c.campaignId).join(c, c.c.id == p.c.campaignId).where(
                        c.c.status == "active", p.c.status == "in_progress", or_(p.c.leaseUntil.is_(None), p.c.leaseUntil < now())
                    ).order_by(p.c.updatedAt).limit(10))
                    campaigns = await db.rows(select(c.c.id).where(c.c.status == "active", c.c.id > campaign_cursor).order_by(c.c.id).limit(100))
                    mc, mconn = table("MetaCampaign"), table("MetaConnection")
                    meta_campaigns = await db.rows(select(mc.c.id).join(mconn, mconn.c.userId == mc.c.userId).where(
                        mc.c.remoteId.is_not(None), mc.c.status.in_(["REMOTE_PAUSED", "ACTIVE", "PAUSED"]),
                        mconn.c.status == "CONNECTED", mconn.c.encryptedToken.is_not(None),
                        mconn.c.adAccountRemoteId.is_not(None),
                        or_(mconn.c.tokenExpiresAt.is_(None), mconn.c.tokenExpiresAt > now())
                    ).order_by(mc.c.updatedAt).limit(100))
                campaign_cursor = campaigns[-1]["id"] if len(campaigns) == 100 else ""
                analytics_ids = {campaign["id"] for campaign in campaigns}
                jobs = {}
                for plan in candidates:
                    jobs.setdefault(plan["campaignId"], []).append(plan["id"])
                for identity in analytics_ids:
                    jobs.setdefault(identity, [])

                async def process(identity, plan_ids):
                    async with slots:
                        for plan_id in plan_ids:
                            try:
                                await advance(plan_id, http)
                            except Exception:
                                log.exception("Workflow advancement failed for plan %s.", plan_id)
                        if identity not in analytics_ids or time.monotonic() - last_analytics.get(identity, -600) < 600:
                            return
                        last_analytics[identity] = time.monotonic()
                        try:
                            await sync_campaign(identity, http)
                        except Exception:
                            log.warning("Analytics synchronization failed for campaign %s; retrying next interval.", identity)
                await asyncio.gather(*(process(identity, plan_ids) for identity, plan_ids in jobs.items()))
                async def process_meta(meta_campaign):
                    identity = meta_campaign["id"]
                    if time.monotonic() - last_meta_analytics.get(identity, -get_settings().meta_insights_sync_seconds) < get_settings().meta_insights_sync_seconds:
                        return
                    last_meta_analytics[identity] = time.monotonic()
                    async with slots:
                        try:
                            await sync_meta_campaign(identity, http)
                        except Exception:
                            log.warning("Meta Ads synchronization failed for campaign %s; retrying next interval.", identity)
                await asyncio.gather(*(process_meta(meta_campaign) for meta_campaign in meta_campaigns))
            except Exception:
                log.error("Worker tick failed; database or provider unavailable. Retrying.")
            await asyncio.sleep(get_settings().worker_poll_seconds)


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop if sys.platform == "win32" else asyncio.new_event_loop) as runner:
        runner.run(run())
