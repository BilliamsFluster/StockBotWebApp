1.1 Plain‑language flow (for non‑technical readers)
Turning Jarvis on. Clicking the Jarvis widget starts microphone capture and opens a live audio connection to the server.

Listening. The browser resamples microphone audio to 16 kHz, breaks it into short chunks, and streams them to the server. If Jarvis is already speaking and you talk over it, a “barge‑in” signal interrupts playback so it can listen to you again.

Understanding & reply. The server detects speech, figures out which person is talking (speaker IDs), transcribes the words, and feeds the text to a language model. Partial replies appear immediately in the chat log.

Speaking back. Jarvis converts the reply to speech and streams audio packets back; the browser queues these packets and plays them while ducking the microphone so its own voice doesn’t get re‑captured.

Typed interaction. In the Chat panel, typing a prompt sends the text to the same language model and optionally plays the response through browser or cloud text‑to‑speech.

1.2 Technical pipeline
Browser capture & WebSocket client.

JarvisProvider sets up an AudioWorklet that resamples the microphone stream to 16 kHz PCM16, computes RMS for local barge‑in detection, and posts audio_chunk messages to the server’s WebSocket

When the WebSocket opens, the client sends a start event and begins recording; it also handles server events such as transcript, partial_response, tts_audio, and interrupt, queuing audio for playback and adjusting input gain accordingly

connectJarvisWebSocket constructs the ws://…/api/jarvis/voice/ws URL from NEXT_PUBLIC_BACKEND_URL and returns a connected WebSocket instance

Node proxy layer.

The Express app registers the WebSocket endpoint and proxies every frame between the browser and the Python service (/api/jarvis/voice/ws). It also forwards planning requests (/edit/plan) for DOM automation

FastAPI orchestration.

jarvis_routes.py mounts a matching WebSocket route. Dependency injection supplies a singleton JarvisService (LLM agent + STT + TTS + memory) to the controller, which delegates the connection to handle_voice_ws

For DOM editing requests, plan_edit runs the agent with a system prompt that outputs a JSON action plan for the current page (clicks, fills, presses, etc.)

Streaming STT → LLM → TTS pipeline.

handle_voice_ws manages per‑connection state: speech buffers, diarization registry, active generation task, TTS cancellation flags, and silence thresholds. Incoming audio_chunk messages are converted to tensors, checked for barge‑in, appended to buffers, and passed through Silero VAD. When silence or max duration ends a phrase, a background task process_and_send_results handles STT, LLM generation and streaming TTS

process_and_send_results levels audio, runs SpeechToText.transcribe_from_array, tags the transcript with the speaker ID, streams LLM deltas via agent.generate_stream, slices sentences with regex, and asynchronously synthesizes each sentence through TextToSpeech.synthesize_to_bytes, sending base64 packets back to the client

JarvisService components.

The service wires together speech recognition (SpeechToText), text‑to‑speech (TextToSpeech), a pluggable BaseAgent (default OllamaAgent), and a Silero VAD model. It exposes helpers for file‑based processing but mainly serves the WebSocket handler with STT, streaming generation and TTS utilities

Typed prompts & voice loop (legacy panel).

JarvisPanel provides a simpler chat UI: typed prompts call askJarvis, which forwards the text to the backend; voice mode uses browser speech recognition (startVoiceAssistant) and speaks replies with either the Web Speech API or a TTS buffer endpoint

Together, the Jarvis stack forms a full duplex audio assistant: the browser streams microphone data over WebSocket, Node relays it to FastAPI, the Python handler detects and transcribes speech, streams LLM tokens and synthesized audio back, and both sides coordinate barge‑in to keep conversations natural.