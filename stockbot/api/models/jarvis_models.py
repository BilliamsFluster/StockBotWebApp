from pydantic import BaseModel

class PromptRequest(BaseModel):
    prompt: str
    model: str
    format: str

class StartVoiceRequest(BaseModel):
    model: str
    format: str
    access_token: str


class SchwabAuthRequest(BaseModel):
    user_id: str
    access_token: str
    refresh_token: str
    expires_at: int
