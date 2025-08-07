from fastapi import Request, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
import os
import tempfile
from api.models.jarvis_models import PromptRequest, StartVoiceRequest
import asyncio
from sse_starlette.sse import EventSourceResponse
import json
import base64
import uuid
import torch
import soundfile as sf
import torchaudio
from silero_vad import load_silero_vad, read_audio, get_speech_timestamps

from pydub import AudioSegment
# Local modules
from Core.config import shared_state
from Core.web.web_search import fetch_financial_snippets
from Core.API.data_fetcher import get_account_data_for_ai
from Core.ollama.ollama_llm import generate_analysis
from Core.jarvis.core import call_jarvis
from Core.jarvis.memory_manager import MemoryManager
import math

