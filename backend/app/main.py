import secrets
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from app import auth, workspace, publishing, ai
from app.agents import workflow, analytics
from app.integrations.zernio import ZernioError

from app.agents.research import run_research
from app.config import Settings, get_settings
from app.integrations.research import ResearchError, ResearchProviders
from app.schemas.research import ResearchRequest, ResearchResult


def require_service_token(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.backend_service_token.get_secret_value()
    if len(expected) < 32:
        raise HTTPException(503, "Backend service authentication is not configured.")
    if not authorization or not secrets.compare_digest(authorization.encode(), f"Bearer {expected}".encode()):
        raise HTTPException(401, "Authentication is required.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient() as client:
        app.state.http = client
        yield


app = FastAPI(title="Socialix Python API", version="0.1.0", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=get_settings().session_secret.get_secret_value() or secrets.token_hex(32),
                   session_cookie="socialix_oauth", https_only=get_settings().cookie_secure, same_site="lax", max_age=600)
app.add_middleware(CORSMiddleware, allow_origins=[get_settings().frontend_origin],
                   allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
                   allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"])
for router in (auth.router, workspace.router, publishing.router, ai.router, workflow.router, analytics.router):
    app.include_router(router)


@app.exception_handler(ValueError)
async def value_error(_request: Request, error: ValueError):
    return JSONResponse(status_code=400, content={"error": str(error)})


@app.exception_handler(ZernioError)
async def zernio_error(_request: Request, error: ZernioError):
    return JSONResponse(status_code=502, content={"error": str(error)})


@app.exception_handler(Exception)
async def unexpected_error(_request: Request, error: Exception):
    import logging
    logging.getLogger("socialix.api").error("Request failed: %s", type(error).__name__)
    return JSONResponse(status_code=500, content={"error": "The backend could not complete this request. Check backend configuration and retry."})


@app.exception_handler(ResearchError)
async def research_error(_request: Request, error: ResearchError):
    return JSONResponse(status_code=504 if "timed out" in str(error) or "time budget" in str(error) else 502,
                        content={"error": str(error), "stage": error.stage, "retryable": error.retryable})


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, error: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": "Invalid request.", "issues": [
        {"path": list(issue["loc"]), "type": issue["type"]} for issue in error.errors()
    ]})


@app.exception_handler(HTTPException)
async def http_error(_request: Request, error: HTTPException):
    return JSONResponse(status_code=error.status_code, content={"error": error.detail}, headers=error.headers)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "socialix-backend"}


@app.post("/internal/research", response_model=ResearchResult,
          dependencies=[Depends(require_service_token)])
async def research(body: ResearchRequest, request: Request, settings: Settings = Depends(get_settings)):
    return await run_research(body, ResearchProviders(settings, request.app.state.http))
