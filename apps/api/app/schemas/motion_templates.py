from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

class TemplateAsset(BaseModel):
    key: str = Field(pattern=r'^[a-zA-Z][a-zA-Z0-9_-]{0,39}$')
    kind: Literal['image', 'video', 'object']
    url: str = Field(max_length=2800000)
    required: bool = False

class TemplateCue(BaseModel):
    at: float = Field(ge=0, le=120)
    sound: Literal['whoosh','impact','tick','rise','press-paper','press-impact','press-marker','press-whoosh','press-pencil','press-rise','press-exit']
    gain: float = Field(ge=0,le=1)

class UploadedMotionTemplate(BaseModel):
    id: str
    profileId: str = Field(min_length=1,max_length=128)
    name: str = Field(min_length=1,max_length=100)
    description: str = Field(default='',max_length=600)
    tags: list[str] = Field(default_factory=list,max_length=12)
    durationSec: float = Field(ge=1,le=120)
    html: str = Field(min_length=1,max_length=200000)
    css: str = Field(default='',max_length=100000)
    js: str = Field(min_length=1,max_length=100000)
    assets: list[TemplateAsset] = Field(default_factory=list,max_length=12)
    audioCues: list[TemplateCue] = Field(default_factory=list,max_length=30)
    aiEnabled: bool = True

    @field_validator('id')
    @classmethod
    def uuid_id(cls,value):
        UUID(value)
        return value
