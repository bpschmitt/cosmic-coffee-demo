import random
import logging
import uuid
import asyncio
import os
from typing import Dict

logger = logging.getLogger(__name__)


class PaymentProcessor:
    """Simulated payment processing service"""

    def __init__(self):
        self.failure_rate = float(os.getenv("PAYMENT_FAILURE_RATE", "0.0"))

        # Binary slowdown simulation (always on when enabled, no timing logic)
        slowdown_env = os.getenv("PAYMENT_SLOWDOWN_ENABLED", "false").lower()
        self._slowdown_enabled = slowdown_env in ("true", "1", "yes")

        # Slowdown delay configuration (seconds)
        self._slowdown_min_delay = 2   # Minimum delay in seconds
        self._slowdown_max_delay = 5   # Maximum delay in seconds

    def _get_slowdown_delay(self) -> float:
        """Get random delay if slowdown is enabled"""
        if not self._slowdown_enabled:
            return 0.0
        return random.uniform(self._slowdown_min_delay, self._slowdown_max_delay)
    
    async def process_payment(
        self,
        customer_name: str,
        customer_email: str,
        amount: float
    ) -> Dict:
        """
        Simulate payment processing

        Returns:
            Dict with 'success' (bool), 'transaction_id' (str), and optional 'reason' (str)
        """
        # Add slowdown delay if enabled
        slowdown_delay = self._get_slowdown_delay()
        if slowdown_delay > 0:
            logger.info("Adding slowdown delay to payment processing", extra={
                "event": "slowdown_delay_applied",
                "delay_seconds": slowdown_delay,
                "customer_name": customer_name
            })
            await asyncio.sleep(slowdown_delay)

        # Simulate payment processing delay
        await asyncio.sleep(0.5)

        # Simulate random payment failures
        if random.random() < self.failure_rate:
            logger.warning("Payment simulation failed", extra={
                "customer_name": customer_name,
                "amount": amount
            })
            return {
                "success": False,
                "reason": "Insufficient funds",
                "transaction_id": None
            }

        transaction_id = str(uuid.uuid4())
        logger.info("Payment processed successfully", extra={
            "customer_name": customer_name,
            "amount": amount,
            "transaction_id": transaction_id
        })

        return {
            "success": True,
            "transaction_id": transaction_id,
            "amount": amount
        }

