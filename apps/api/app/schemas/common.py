from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)


def to_iso(dt: datetime) -> str:
    return dt.isoformat()
