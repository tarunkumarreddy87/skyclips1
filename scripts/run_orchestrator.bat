@echo off
setlocal EnableExtensions
cd /d D:\HANUMAN\workers\orchestrator
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("D:\HANUMAN\.env") do (
  if not "%%A"=="" if not "%%A"=="" set "%%A=%%B"
)
set TEMPORAL_HOST=localhost:7233
set API_BASE_URL=http://localhost:8000
set S3_ENDPOINT=http://localhost:9000
set PYTHONUNBUFFERED=1
".venv\Scripts\python.exe" -u -m src.worker >> D:\HANUMAN\scripts\_orch.err.log 2>&1
