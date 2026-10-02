from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ExpenseBase(BaseModel):
    desc: str = Field(min_length=1)
    amount: float = Field(gt=0)
    cat: str = Field(min_length=1)
    date: date
    currency: str = Field(min_length=3, max_length=3)


class ExpenseCreate(ExpenseBase):
    id: Optional[str] = None


class ExpenseUpdate(BaseModel):
    desc: str = Field(min_length=1)
    amount: float = Field(gt=0)
    cat: str = Field(min_length=1)
    date: date
    currency: str = Field(min_length=3, max_length=3)


class ExpenseResponse(ExpenseBase):
    id: str

    model_config = ConfigDict(from_attributes=True)


class BulkDeleteRequest(BaseModel):
    ids: list[str] = Field(min_length=1)


class SettingsResponse(BaseModel):
    currency: str
    monthly_budget: float


class SettingsUpdate(BaseModel):
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    monthly_budget: Optional[float] = Field(default=None, ge=0)


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=255)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class AuditLogResponse(BaseModel):
    id: str
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    summary: str
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_model(cls, log) -> "AuditLogResponse":
        return cls(
            id=log.id,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            summary=log.summary,
            metadata=log.metadata_json,
            created_at=log.created_at,
        )
