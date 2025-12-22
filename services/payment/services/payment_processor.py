import random
import logging
import uuid
import asyncio
import os
import time
from typing import Dict

logger = logging.getLogger(__name__)


class PaymentProcessor:
    """Simulated payment processing service"""
    
    def __init__(self):
        # Simulate payment failures ~5% of the time for demo purposes
        self.failure_rate = 0.05
        
        # Slowdown simulation configuration
        slowdown_env = os.getenv("PAYMENT_SLOWDOWN_ENABLED", "false").lower()
        self._slowdown_enabled = slowdown_env in ("true", "1", "yes")
        
        # Slowdown timing configuration (seconds)
        self._slowdown_interval = 900  # 15 minutes between slowdown cycles
        self._slowdown_duration = 300  # 5 minutes slowdown duration
        self._slowdown_min_delay = 2   # Minimum delay in seconds
        self._slowdown_max_delay = 5   # Maximum delay in seconds
        
        # Slowdown state tracking
        self._slowdown_active = False
        self._slowdown_start_time = None
        self._next_slowdown_time = time.time() if self._slowdown_enabled else None
        
        # Thread-safe lock for state updates (using asyncio.Lock)
        self._slowdown_lock = asyncio.Lock()
    
    def _check_and_update_slowdown(self) -> None:
        """Check and update slowdown state based on timing"""
        if not self._slowdown_enabled:
            return
        
        current_time = time.time()
        
        # Check if we should start a new slowdown period
        if not self._slowdown_active and self._next_slowdown_time and current_time >= self._next_slowdown_time:
            self._slowdown_active = True
            self._slowdown_start_time = current_time
            logger.info("Payment slowdown period started", extra={
                "event": "slowdown_started",
                "duration_seconds": self._slowdown_duration,
                "expected_end_time": current_time + self._slowdown_duration
            })
        # Check if current slowdown period should end
        elif self._slowdown_active and self._slowdown_start_time:
            elapsed = current_time - self._slowdown_start_time
            if elapsed >= self._slowdown_duration:
                self._slowdown_active = False
                self._slowdown_start_time = None
                self._next_slowdown_time = current_time + self._slowdown_interval
                logger.info("Payment slowdown period ended", extra={
                    "event": "slowdown_ended",
                    "next_slowdown_time": self._next_slowdown_time
                })
    
    def _get_slowdown_delay(self) -> float:
        """Get random delay to add if currently in slowdown period"""
        if not self._slowdown_enabled or not self._slowdown_active:
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
        # Check and update slowdown state
        async with self._slowdown_lock:
            self._check_and_update_slowdown()
            slowdown_delay = self._get_slowdown_delay()
        
        # Add slowdown delay if in slowdown period
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

