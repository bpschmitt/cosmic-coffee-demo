from pydantic import BaseModel
from typing import Optional


class PaymentRequest(BaseModel):
    customer_name: str
    customer_email: Optional[str] = None
    amount: float


class PaymentResponse(BaseModel):
    success: bool
    transaction_id: Optional[str] = None
    reason: Optional[str] = None
    amount: Optional[float] = None


class HealthResponse(BaseModel):
    status: str
    service: str

