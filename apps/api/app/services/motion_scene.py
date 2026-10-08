"""Bounded, declarative compositions authored by the editor model."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SceneModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class MotionKeyframe(SceneModel):
    timeMs: float = Field(ge=0, le=30000)
    x: float | None = Field(default=None, ge=-200, le=300)
    y: float | None = Field(default=None, ge=-200, le=300)
    scale: float | None = Field(default=None, ge=0, le=8)
    rotation: float | None = Field(default=None, ge=-1080, le=1080)
    opacity: float | None = Field(default=None, ge=0, le=1)
    reveal: float | None = Field(default=None, ge=0, le=1)
    value: float | None = Field(default=None, ge=-1e15, le=1e15)


class MotionLayer(SceneModel):
    id: str = Field(min_length=1, max_length=80)
    kind: Literal["text", "rectangle", "ellipse", "line", "image", "counter"]
    x: float = Field(ge=-100, le=200)
    y: float = Field(ge=-100, le=200)
    width: float = Field(gt=0, le=200)
    height: float = Field(gt=0, le=200)
    text: str | None = Field(default=None, max_length=1200)
    src: str | None = Field(default=None, max_length=8192, pattern=r"^https?://")
    color: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
    fontSize: float = Field(default=64, ge=12, le=300)
    fontWeight: int = Field(default=700, ge=100, le=900)
    fontFamily: Literal["sans", "serif", "mono"] = "sans"
    align: Literal["left", "center", "right"] = "center"
    radius: float = Field(default=0, ge=0, le=200)
    strokeWidth: float = Field(default=0, ge=0, le=30)
    strokeColor: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    shadow: float = Field(default=0, ge=0, le=60)
    startMs: float = Field(default=0, ge=0, le=30000)
    endMs: float = Field(gt=0, le=30000)
    easing: Literal["linear", "smooth", "spring"] = "smooth"
    keyframes: list[MotionKeyframe] = Field(default_factory=list, max_length=24)
    prefix: str | None = Field(default=None, max_length=30)
    suffix: str | None = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def valid_timing(self):
        times = [frame.timeMs for frame in self.keyframes]
        if self.endMs <= self.startMs or times != sorted(set(times)):
            raise ValueError("Layer timing must increase; keyframe times must be unique")
        if self.kind == "image" and not self.src:
            raise ValueError("Image layers require a supplied source URL")
        return self


class MotionAudioCue(SceneModel):
    sound: Literal["whoosh", "impact", "tick", "rise", "ambient"]
    startMs: float = Field(ge=0, le=30000)
    volume: float = Field(default=0.3, ge=0, le=1)


class MotionScene(SceneModel):
    version: Literal[1] = 1
    title: str = Field(min_length=1, max_length=160)
    durationMs: float = Field(ge=1000, le=30000)
    background: str = Field(default="#111318", pattern=r"^(#[0-9a-fA-F]{6}|transparent)$")
    layers: list[MotionLayer] = Field(min_length=1, max_length=48)
    audio: list[MotionAudioCue] = Field(default_factory=list, max_length=16)

    @model_validator(mode="after")
    def valid_scene(self):
        if len({layer.id for layer in self.layers}) != len(self.layers):
            raise ValueError("Layer IDs must be unique")
        if any(layer.endMs > self.durationMs or any(frame.timeMs > self.durationMs for frame in layer.keyframes) for layer in self.layers):
            raise ValueError("Layers and keyframes must fit the scene duration")
        if any(cue.startMs >= self.durationMs for cue in self.audio):
            raise ValueError("Sound cues must start inside the scene")
        return self
