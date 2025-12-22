import os
import logging
import asyncio
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models import PaymentRequest, PaymentResponse, HealthResponse
from services.payment_processor import PaymentProcessor

load_dotenv()

app = FastAPI(title="Cosmic Coffee Payment Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Initialize payment processor
payment_processor = PaymentProcessor()

# Check if slowdown is enabled
slowdown_enabled = os.getenv("PAYMENT_SLOWDOWN_ENABLED", "false").lower() in ("true", "1", "yes")


async def monitor_slowdown_cycles():
    """Background task to periodically check and update slowdown state"""
    while True:
        try:
            # Check every 30 seconds
            await asyncio.sleep(30)
            # Trigger state check in payment processor
            async with payment_processor._slowdown_lock:
                payment_processor._check_and_update_slowdown()
        except asyncio.CancelledError:
            logger.info("Slowdown monitoring task cancelled")
            break
        except Exception as e:
            logger.error("Error in slowdown monitoring task", extra={"error": str(e)}, exc_info=True)


@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    if slowdown_enabled:
        logger.info("Payment slowdown simulation enabled", extra={
            "event": "slowdown_feature_status",
            "status": "enabled",
            "interval_seconds": 900,
            "duration_seconds": 300,
            "delay_range_seconds": "2-5"
        })
        # Start background monitoring task
        asyncio.create_task(monitor_slowdown_cycles())
    else:
        logger.info("Payment slowdown simulation disabled", extra={
            "event": "slowdown_feature_status",
            "status": "disabled"
        })


@app.middleware("http")
async def propagate_trace_headers(request: Request, call_next):
    """Propagate trace headers for distributed tracing"""
    # Store trace headers in request state for logging if needed
    traceparent = request.headers.get("traceparent")
    tracestate = request.headers.get("tracestate")
    
    request.state.traceparent = traceparent
    request.state.tracestate = tracestate
    
    response = await call_next(request)
    return response


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    return HealthResponse(status="ok", service="payment")


@app.post("/api/payment", response_model=PaymentResponse)
async def process_payment(request: Request, payment_request: PaymentRequest):
    """
    Process payment (simulated)
    
    Returns payment result with transaction ID if successful
    """
    try:
        logger.info("Processing payment", extra={
            "customer_name": payment_request.customer_name,
            "amount": payment_request.amount
        })
        
        result = await payment_processor.process_payment(
            payment_request.customer_name,
            payment_request.customer_email or "",
            payment_request.amount
        )
        
        if not result["success"]:
            logger.warning("Payment failed", extra={
                "customer_name": payment_request.customer_name,
                "amount": payment_request.amount,
                "reason": result.get("reason")
            })
            raise HTTPException(
                status_code=402,
                detail=f"Payment failed: {result.get('reason', 'Unknown error')}"
            )
        
        return PaymentResponse(
            success=True,
            transaction_id=result.get("transaction_id"),
            amount=result.get("amount")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Payment processing error", extra={"error": str(e)}, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4002)

