@echo off
setlocal EnableExtensions
cd /d D:\HANUMAN\workers\media
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("D:\HANUMAN\.env") do (
  if not "%%A"=="" set "%%A=%%B"
)
set TEMPORAL_HOST=localhost:7233
set API_BASE_URL=http://localhost:8000
set S3_ENDPOINT=http://localhost:9000
set RENDER_ENGINE=remotion-local
set RENDER_FFMPEG_FALLBACK=false
set PYTHONUNBUFFERED=1
".venv\Scripts\python.exe" -u -m src.worker >> D:\HANUMAN\scripts\_media.err.log 2>&1
