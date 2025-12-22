from locust import HttpUser, task, between
import random
import time
from faker import Faker
import logging

fake = Faker()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CosmicCoffeeUser(HttpUser):
    """
    Simulates a user interacting with the Cosmic Coffee application.
    Flow: Add items to cart -> Checkout (payment + order creation)
    Creates orders every 5 seconds with a random number of products.
    """
    wait_time = between(5, 5)  # Wait exactly 5 seconds between tasks
    
    def on_start(self):
        """Called when a user starts. Fetch products to simulate browsing."""
        # Locust's HttpUser handles cookies automatically by default
        self.products = []
        response = self.client.get("/api/products", name="Get Products")
        if response.status_code == 200:
            self.products = response.json()
            logger.info(f"Load generator started - loaded {len(self.products)} products")
        else:
            logger.warning(f"Failed to load products: HTTP {response.status_code}")
        self.last_order_time = time.time()
    
    @task(1)
    def place_order(self):
        """Place an order: Add items to cart -> Checkout"""
        if not self.products:
            # Refresh products if we don't have any
            response = self.client.get("/api/products", name="Refresh Products")
            if response.status_code == 200:
                self.products = response.json()
        
        if self.products:
            # Step 1: Add items to cart
            # Select random number of products (1 to all available products)
            num_items = random.randint(1, min(len(self.products), 5))  # Limit to 5 items max
            selected_products = random.sample(self.products, num_items)
            
            # Add each item to cart
            cart_items_added = 0
            for product in selected_products:
                cart_item = {
                    "productId": product["id"],  # Note: camelCase for .NET service
                    "quantity": random.randint(1, 3)
                }
                response = self.client.post("/api/cart/items", json=cart_item, name="Add to Cart")
                if response.status_code == 200:
                    cart_items_added += 1
                else:
                    error_detail = ""
                    try:
                        error_json = response.json()
                        error_detail = error_json.get('error', error_json.get('detail', response.text[:200]))
                    except:
                        error_detail = response.text[:200] if response.text else f"HTTP {response.status_code}"
                    logger.warning(f"Failed to add product {product['id']} to cart: HTTP {response.status_code} - {error_detail}")
            
            if cart_items_added == 0:
                logger.warning("No items were added to cart, skipping checkout")
                return
            
            # Step 2: Generate random fake name and email
            customer_name = fake.name()
            customer_email = fake.email()
            
            # Step 3: Checkout (payment + order creation)
            # Note: Cart is managed server-side, so we only send customer info
            checkout_data = {
                "customer_name": customer_name,
                "customer_email": customer_email
            }
            
            response = self.client.post("/api/checkout", json=checkout_data, name="Checkout")
            
            if response.status_code == 200:
                try:
                    response_data = response.json()
                    if response_data.get('success'):
                        order_total = float(response_data.get('total_amount', 0))
                        order_id = response_data.get('order_id', 'unknown')
                        logger.info(f"Checkout successful: Order #{order_id}, {cart_items_added} items for {customer_name} (${order_total:.2f})")
                    else:
                        error_msg = response_data.get('error', 'Unknown error')
                        logger.warning(f"Checkout failed for {customer_name}: {error_msg}")
                except (ValueError, TypeError):
                    logger.info(f"Checkout completed: {cart_items_added} items for {customer_name}")
            elif response.status_code == 400:
                try:
                    error_msg = response.json().get('error', 'Bad request')
                except:
                    error_msg = response.text[:100]
                logger.warning(f"Checkout failed (400): {customer_name} - {error_msg}")
            elif response.status_code == 402:
                logger.warning(f"Payment failed for {customer_name}")
            elif response.status_code == 503:
                try:
                    error_msg = response.json().get('error', 'Service unavailable')
                except:
                    error_msg = 'Service unavailable'
                logger.warning(f"Checkout failed (503): {customer_name} - {error_msg}")
            else:
                logger.error(f"Checkout failed ({response.status_code}): {customer_name} - {response.text[:100]}")
            
            self.last_order_time = time.time()
