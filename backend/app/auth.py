import hashlib
import secrets
from datetime import timedelta

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy import select

from app.config import get_settings
from app.db import transaction, table, now

router = APIRouter(prefix="/api/auth")
COOKIE = "socialix_session"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_for(token):
    import hmac
    return hmac.new(get_settings().session_secret.get_secret_value().encode(), token.encode(), hashlib.sha256).hexdigest()


async def current_user(request: Request):
    token = request.cookies.get(COOKIE, "")
    if not token:
        raise HTTPException(401, "Authentication is required.")
    async with transaction() as db:
        s, u = table("Session"), table("User")
        user = await db.one(select(u.c.id, u.c.name, u.c.email, u.c.image).select_from(
            u.join(s, u.c.id == s.c.userId)).where(s.c.sessionToken == digest(token), s.c.expires > now()))
    if not user:
        raise HTTPException(401, "Authentication is required.")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if request.headers.get("origin") != get_settings().frontend_origin:
            raise HTTPException(403, "Untrusted request origin.")
        supplied = request.headers.get("x-csrf-token", "")
        if not secrets.compare_digest(supplied.encode(), csrf_for(token).encode()):
            raise HTTPException(403, "Invalid CSRF token. Refresh the page and retry.")
    return user


def google_client():
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret.get_secret_value() or len(settings.session_secret.get_secret_value()) < 32:
        raise HTTPException(503, "Google login is not configured in the Python backend.")
    oauth = OAuth()
    return oauth.register("google", client_id=settings.google_client_id,
        client_secret=settings.google_client_secret.get_secret_value(),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"})


@router.get("/login/google")
async def login(request: Request):
    return await google_client().authorize_redirect(request, get_settings().google_redirect_uri)


@router.get("/callback/google")
async def callback(request: Request):
    try:
        token = await google_client().authorize_access_token(request)
        info = token.get("userinfo")
        if not info or not info.get("sub") or info.get("email_verified") is not True:
            raise ValueError("Unverified identity")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Google login could not be verified. Please try again.") from None
    async with transaction() as db:
        account, users = table("Account"), table("User")
        linked = await db.one(select(account).where(account.c.provider == "google", account.c.providerAccountId == info["sub"]))
        if linked:
            user = await db.one(select(users).where(users.c.id == linked["userId"]))
        else:
            existing = await db.one(select(users).where(users.c.email == info.get("email")))
            if existing:
                # Never link a different provider identity by email alone.
                raise HTTPException(409, "This email already has an account. Sign in with its original Google identity.")
            user = await db.insert("User", {"name": info.get("name"), "email": info.get("email"),
                "image": info.get("picture"), "emailVerified": now()})
            await db.insert("Account", {"userId": user["id"], "type": "oauth", "provider": "google", "providerAccountId": info["sub"]})
        session_token = secrets.token_urlsafe(48)
        await db.insert("Session", {"userId": user["id"], "sessionToken": digest(session_token), "expires": now() + timedelta(days=7)})
    request.session.clear()
    response = RedirectResponse(get_settings().frontend_origin)
    response.set_cookie(COOKIE, session_token, max_age=7 * 86400, httponly=True,
                        secure=get_settings().cookie_secure, samesite="lax", path="/")
    return response


@router.get("/session")
async def session(request: Request):
    try:
        user = await current_user(request)
    except HTTPException as error:
        if error.status_code == 401:
            return JSONResponse({"user": None}, headers={"Cache-Control": "no-store"})
        raise
    return JSONResponse({"user": user, "csrfToken": csrf_for(request.cookies[COOKIE])}, headers={"Cache-Control": "no-store"})


@router.post("/logout")
async def logout(request: Request, user=Depends(current_user)):
    async with transaction() as db:
        t = table("Session")
        await db.connection.execute(t.delete().where(t.c.sessionToken == digest(request.cookies[COOKIE])))
    response = JSONResponse({"success": True})
    response.delete_cookie(COOKIE, path="/")
    return response
