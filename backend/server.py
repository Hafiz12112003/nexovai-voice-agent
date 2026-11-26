import asyncio
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

import activity
import clinic
from bot import run_bot

handler = SmallWebRTCRequestHandler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await handler.close()


app = FastAPI(title="Aster Clinic Voice Agent", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/offer")
async def offer(request: SmallWebRTCRequest, background_tasks: BackgroundTasks):
    async def on_connection(connection):
        background_tasks.add_task(run_bot, connection)

    return await handler.handle_web_request(
        request=request, webrtc_connection_callback=on_connection
    )


@app.patch("/api/offer")
async def ice_candidate(request: SmallWebRTCPatchRequest):
    await handler.handle_patch_request(request)
    return {"status": "success"}


@app.get("/api/doctors")
async def doctors():
    return clinic.list_doctors()


@app.get("/api/appointments")
async def appointments():
    return clinic.list_appointments()


@app.get("/api/events")
async def events(since: int = 0):
    return clinic.events_since(since)


@app.get("/api/activity")
async def activity_feed(since: int = 0):
    return activity.since(since)


@app.get("/api/health")
async def health():
    return {"ok": True}

