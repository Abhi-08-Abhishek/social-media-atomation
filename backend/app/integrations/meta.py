from dataclasses import dataclass, field

import httpx
from fastapi import HTTPException
from sqlalchemy import select

from app.config import get_settings
from app.credentials import decrypt_credential
from app.db import now, table, transaction


class MetaError(Exception):
    def __init__(self, message: str, status: int | None = None, code: int | None = None, ambiguous: bool = False):
        self.status = status
        self.code = code
        self.ambiguous = ambiguous
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class MetaAuth:
    token: str = field(repr=False)


def account_path(account_id: str) -> str:
    return "/act_" + account_id.removeprefix("act_")


async def request(http: httpx.AsyncClient, auth: MetaAuth, method: str, path: str, **kwargs):
    settings = get_settings()
    url = path if path.startswith("https://") else f"https://graph.facebook.com/{settings.meta_graph_version}{path}"
    headers = {"Authorization": f"Bearer {auth.token}", **kwargs.pop("headers", {})}
    try:
        response = await http.request(method, url, headers=headers, timeout=30, **kwargs)
        payload = response.json()
    except httpx.TimeoutException:
        raise MetaError("Meta timed out. Reconcile the request before retrying.", ambiguous=method != "GET") from None
    except httpx.RequestError:
        raise MetaError("Meta is unavailable. Reconcile the request before retrying.", ambiguous=method != "GET") from None
    except ValueError:
        raise MetaError("Meta returned an invalid response.", status=response.status_code) from None
    if not response.is_success or (isinstance(payload, dict) and payload.get("error")):
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        message = error.get("error_user_msg") or error.get("message") or "Meta rejected the request."
        message = message.replace(auth.token, "[redacted]")
        raise MetaError(message, status=response.status_code, code=error.get("code"))
    if not isinstance(payload, dict):
        raise MetaError("Meta returned an invalid response.", status=response.status_code)
    return payload


async def user_auth(user_id: str) -> MetaAuth:
    async with transaction() as db:
        c = table("MetaConnection")
        row = await db.one(select(c).where(c.c.userId == user_id))
    if not row or row["status"] != "CONNECTED" or not row["adAccountRemoteId"] or not row["encryptedToken"]:
        raise HTTPException(400, "Add your Meta Ad Account ID and Access Token in Settings first.")
    if row["tokenExpiresAt"] and row["tokenExpiresAt"] <= now():
        raise HTTPException(409, "Your Meta access token expired. Replace it in Settings.")
    token = decrypt_credential(row["encryptedToken"], user_id,
        get_settings().credential_encryption_key.get_secret_value())
    return MetaAuth(token)


async def paginate(http: httpx.AsyncClient, auth: MetaAuth, path: str, params=None, max_pages=5):
    items, next_path = [], path
    next_params = params or {}
    for _ in range(max_pages):
        payload = await request(http, auth, "GET", next_path, params=next_params)
        data = payload.get("data")
        if not isinstance(data, list):
            raise MetaError("Meta returned an invalid collection.")
        items.extend(data)
        next_path = (payload.get("paging") or {}).get("next")
        next_params = {}
        if not next_path:
            break
    return items


async def ad_account(http: httpx.AsyncClient, auth: MetaAuth, account_id: str):
    expected = account_id.removeprefix("act_")
    row = await request(http, auth, "GET", account_path(expected), params={
        "fields": "id,account_id,name,currency,timezone_name,account_status"})
    remote_id = str(row.get("account_id") or str(row.get("id", "")).removeprefix("act_"))
    if not remote_id or remote_id != expected:
        raise MetaError("Meta returned a different ad account than requested.")
    return {"id": remote_id, "name": row.get("name") or "Meta ad account",
        "currency": row.get("currency") or "USD", "timezoneName": row.get("timezone_name") or "UTC",
        "status": str(row.get("account_status", "UNKNOWN"))}


async def assets(http: httpx.AsyncClient, auth: MetaAuth, account_id: str):
    pages = await paginate(http, auth, "/me/accounts", {
        "fields": "id,name,instagram_business_account{id,username}", "limit": 100})
    pixels = await paginate(http, auth, account_path(account_id) + "/adspixels", {"fields": "id,name", "limit": 100})
    return {"pages": [{"id": page["id"], "name": page.get("name") or "Facebook Page",
        "instagram": page.get("instagram_business_account")} for page in pages],
        "pixels": [{"id": pixel["id"], "name": pixel.get("name") or "Meta Pixel"} for pixel in pixels]}


async def targeting_search(http: httpx.AsyncClient, auth: MetaAuth, query: str):
    rows = await paginate(http, auth, "/search", {"type": "adinterest", "q": query, "limit": 20}, 1)
    return [{"id": row["id"], "name": row.get("name") or ""} for row in rows if row.get("id")]


async def custom_audiences(http: httpx.AsyncClient, auth: MetaAuth, account_id: str):
    rows = await paginate(http, auth, account_path(account_id) + "/customaudiences", {
        "fields": "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status",
        "limit": 100}, 2)
    return [{"id": str(row["id"]), "name": row.get("name") or "Custom Audience",
        "subtype": row.get("subtype"), "sizeLower": row.get("approximate_count_lower_bound"),
        "sizeUpper": row.get("approximate_count_upper_bound"), "deliveryStatus": row.get("delivery_status")}
        for row in rows if row.get("id")]


async def create_campaign(http, auth, account_id, payload):
    return await request(http, auth, "POST", account_path(account_id) + "/campaigns", data=payload)


async def create_ad_set(http, auth, account_id, payload):
    return await request(http, auth, "POST", account_path(account_id) + "/adsets", data=payload)


async def create_creative(http, auth, account_id, payload):
    return await request(http, auth, "POST", account_path(account_id) + "/adcreatives", data=payload)


async def create_ad(http, auth, account_id, payload):
    return await request(http, auth, "POST", account_path(account_id) + "/ads", data=payload)


async def set_status(http, auth, remote_id, status):
    return await request(http, auth, "POST", "/" + remote_id, data={"status": status})


async def object_status(http, auth, remote_id, fields="id,status,effective_status,issues_info"):
    return await request(http, auth, "GET", "/" + remote_id, params={"fields": fields})


async def insights(http, auth, remote_id):
    return await paginate(http, auth, "/" + remote_id + "/insights", {
        "fields": "date_start,date_stop,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values",
        "date_preset": "last_7d", "limit": 100}, 2)


async def list_named(http, auth, account_id, edge: str):
    return await paginate(http, auth, account_path(account_id) + "/" + edge,
        {"fields": "id,name,status,effective_status", "limit": 500}, 1)
