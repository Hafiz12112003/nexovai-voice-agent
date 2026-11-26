import os
from datetime import date
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from loguru import logger

from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frameworks.rtvi import RTVIObserver, RTVIProcessor
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService, ElevenLabsSTTSettings
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

import clinic

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CLINIC_NAME = "Aster Clinic"


def system_prompt():
    today = date.today()
    return f"""You are the voice receptionist for {CLINIC_NAME}. You talk to callers on the phone.
Today is {today.strftime('%A, %d %B %Y')} ({today.isoformat()}).

You can do three things: check doctor availability, book an appointment, cancel an appointment.

Doctors at the clinic:
- Dr. Priya Raman, Cardiology
- Dr. Arjun Mehta, Dermatology
- Dr. Kavya Nair, Pediatrics
- Dr. Rahul Verma, General Medicine
The caller's speech is transcribed automatically, so names are often misspelled (for example "Roman" for Raman, "Varma" for Verma). Always map what you hear to the closest doctor above, and use the correct name in tool calls.

Style:
- Speak naturally and warmly, in short sentences. One or two sentences per turn.
- Never use markdown, lists, bullet points, or emojis. Your words are spoken aloud.
- Say dates like "Thursday, the twenty-sixth" and times like "ten in the morning".
- Offer at most three options at a time.
- Greet the caller only once, at the very start. Never greet or introduce yourself again.
- Callers speak in short bursts and the transcript can arrive in fragments. If the last words sound cut off or incomplete, just say "Go on." Do not restart or repeat earlier questions.

Rules:
- The caller is identified only by the phone number they say out loud. Never ask for anything else to verify them.
- Phone numbers: callers say digits in several pieces. Keep a running count. If you have fewer than 10 digits, say only "Go on" or ask for the remaining digits. Once you have all 10, read the number back digit by digit and ask them to confirm. Only call book_appointment or cancel_appointment after they say yes. If they correct you, read the new number back again. In the tool call, pass exactly the ten digits you read back and the caller confirmed, with no changes.
- Before booking, make sure you have the doctor (or speciality), the date and the time, and that you offered it from real availability.
- Always call check_doctor_availability before offering slots. Never invent slots.
- After a booking or cancellation, confirm the result in one sentence, then ask if they need anything else.
- If a tool returns an error, explain it simply and offer an alternative.
- Dates passed to tools must be in YYYY-MM-DD format, times in 24-hour HH:MM.
- If asked something unrelated to appointments, politely say you can only help with appointments."""


async def check_availability(params: FunctionCallParams):
    a = params.arguments
    await params.result_callback(clinic.check_availability(a.get("doctor"), a.get("date")))


async def book_appointment(params: FunctionCallParams):
    a = params.arguments
    await params.result_callback(
        clinic.book(a.get("phone"), a.get("doctor"), a.get("date"), a.get("time"))
    )


async def cancel_appointment(params: FunctionCallParams):
    await params.result_callback(clinic.cancel(params.arguments.get("phone")))


def build_tools():
    return ToolsSchema(
        standard_tools=[
            FunctionSchema(
                name="check_doctor_availability",
                description="Get free appointment slots. Filter by doctor name or speciality and/or a date.",
                properties={
                    "doctor": {"type": "string", "description": "Doctor name or speciality, e.g. 'Cardiology' or 'Dr. Priya Raman'. Optional."},
                    "date": {"type": "string", "description": "Date in YYYY-MM-DD. Optional."},
                },
                required=[],
            ),
            FunctionSchema(
                name="book_appointment",
                description="Book a slot for the caller. Only call after the caller confirmed their phone number.",
                properties={
                    "phone": {"type": "string", "description": "Caller's 10-digit phone number, digits only."},
                    "doctor": {"type": "string", "description": "Doctor name from the availability results."},
                    "date": {"type": "string", "description": "Date in YYYY-MM-DD."},
                    "time": {"type": "string", "description": "Time in 24-hour HH:MM."},
                },
                required=["phone", "doctor", "date", "time"],
            ),
            FunctionSchema(
                name="cancel_appointment",
                description="Cancel the caller's existing appointment. Only call after the caller confirmed their phone number.",
                properties={
                    "phone": {"type": "string", "description": "Caller's 10-digit phone number, digits only."},
                },
                required=["phone"],
            ),
        ]
    )


async def run_bot(webrtc_connection):
    async with aiohttp.ClientSession() as session:
        transport = SmallWebRTCTransport(
            webrtc_connection=webrtc_connection,
            params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
        )

        stt = ElevenLabsSTTService(
            api_key=os.environ["ELEVENLABS_API_KEY"],
            aiohttp_session=session,
            settings=ElevenLabsSTTSettings(language=Language.EN, tag_audio_events=False),
        )
        tts = ElevenLabsTTSService(
            api_key=os.environ["ELEVENLABS_API_KEY"],
            voice_id=os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
            model="eleven_flash_v2_5",
        )
        llm = GoogleLLMService(
            api_key=os.environ["GOOGLE_API_KEY"],
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
            system_instruction=system_prompt(),
        )
        llm.register_function("check_doctor_availability", check_availability)
        llm.register_function("book_appointment", book_appointment)
        llm.register_function("cancel_appointment", cancel_appointment)

        context = LLMContext(tools=build_tools())
        user_agg, assistant_agg = LLMContextAggregatorPair(
            context,
            user_params=LLMUserAggregatorParams(
                vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.8)),
            ),
        )

        rtvi = RTVIProcessor()

        pipeline = Pipeline(
            [
                transport.input(),
                rtvi,
                stt,
                user_agg,
                llm,
                tts,
                transport.output(),
                assistant_agg,
            ]
        )

        task = PipelineTask(
            pipeline,
            params=PipelineParams(enable_metrics=True),
            observers=[RTVIObserver(rtvi)],
        )

        @rtvi.event_handler("on_client_ready")
        async def on_client_ready(rtvi):
            await rtvi.set_bot_ready()
            context.add_message(
                {
                    "role": "user",
                    "content": f"The call just connected. Greet the caller once, briefly, as {CLINIC_NAME} and ask how you can help. Do not greet again for the rest of the call.",
                }
            )
            await task.queue_frames([LLMRunFrame()])

        @transport.event_handler("on_client_disconnected")
        async def on_client_disconnected(transport, client):
            logger.info("Client disconnected")
            await task.cancel()

        await PipelineRunner(handle_sigint=False).run(task)


