from pydantic import BaseModel

class PromptRequest(BaseModel):
    prompt: str
    model: str
    format: str

class StartVoiceRequest(BaseModel):
    model: str
    format: str
