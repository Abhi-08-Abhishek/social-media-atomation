from urllib.parse import quote
import httpx
from fastapi import HTTPException
from sqlalchemy import select
from app.config import get_settings
from app.db import transaction, table
from app.credentials import decrypt_credential


class ZernioError(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Zernio request failed ({status}).")


async def user_key(user_id):
    async with transaction() as db:
        u = table("User")
        row = await db.one(select(u.c.zernioCredential).where(u.c.id == user_id))
    if not row or not row["zernioCredential"]:
        raise HTTPException(400, "Connect your Zernio account in Settings first.")
    return decrypt_credential(row["zernioCredential"], user_id, get_settings().credential_encryption_key.get_secret_value())


async def request(http, key, method, path, **kwargs):
    base = get_settings().zernio_base_url
    if not base or not key:
        raise HTTPException(503, "Zernio is not configured.")
    headers = {"Authorization": f"Bearer {key}", **kwargs.pop("headers", {})}
    try:
        response = await http.request(method, base.rstrip("/") + path, headers=headers, timeout=20, **kwargs)
        if not response.is_success:
            raise ZernioError(response.status_code)
        if response.status_code == 204:
            return {}
        return response.json()
    except httpx.TimeoutException:
        raise HTTPException(504, "Zernio timed out. Check provider status before retrying a publishing request.") from None
    except (httpx.RequestError, ValueError):
        raise HTTPException(502, "Zernio returned an unavailable or invalid response.") from None


async def accounts(http, key):
    data = await request(http, key, "GET", "/accounts")
    if not isinstance(data.get("accounts"), list):
        raise HTTPException(502, "Zernio returned an invalid accounts response.")
    result = []
    for item in data["accounts"]:
        identity = item.get("_id") or item.get("id")
        if not identity or not item.get("platform"):
            continue
        username = item.get("username") or ""
        result.append({"id": identity, "platform": "X" if item["platform"].lower() == "twitter" else item["platform"].upper(),
            "username": "@" + username.lstrip("@") if username else "", "displayName": item.get("displayName") or username,
            "isActive": item.get("isActive") is True, "profilePicture": item.get("profilePicture"),
            "profileUrl": item.get("profileUrl"), "followersCount": item.get("followersCount")})
    return result


def post_path(post_id):
    return "/posts/" + quote(post_id, safe="")
