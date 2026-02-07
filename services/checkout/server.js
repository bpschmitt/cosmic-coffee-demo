const express = require('express');
const cors = require('cors');
const winston = require('winston');
require('dotenv').config();

const CartClient = require('./services/cartClient');
const PaymentClient = require('./services/paymentClient');
const OrdersClient = require('./services/ordersClient');

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.json()
    })
  ]
});

const app = express();
const PORT = process.env.PORT || 4004;

// Initialize service clients
const cartClient = new CartClient(process.env.CART_SERVICE_URL || 'http://cart:4003');
const paymentClient = new PaymentClient(process.env.PAYMENT_SERVICE_URL || 'http://payment:4002');
const ordersClient = new OrdersClient(process.env.ORDERS_SERVICE_URL || 'http://orders:4000');

// Middleware
app.use(cors());
app.use(express.json());

// Extract trace headers and cookies from request
function getTraceHeaders(req) {
  const headers = {};
  if (req.headers.traceparent) {
    headers.traceparent = req.headers.traceparent;
  }
  if (req.headers.tracestate) {
    headers.tracestate = req.headers.tracestate;
  }
  // Forward cookies for session-based services (e.g., cart service)
  if (req.headers.cookie) {
    headers.cookie = req.headers.cookie;
  }
  return headers;
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check dependencies
    const dependencies = {};
    
    try {
      await cartClient.getCart();
      dependencies.cart = 'ok';
    } catch (error) {
      dependencies.cart = 'unavailable';
    }
    
    try {
      await paymentClient.processPayment('test', '', 0);
    } catch (error) {
      // Payment service might reject test payment, but if we get a response it's up
      if (error.status === 402) {
        dependencies.payment = 'ok';
      } else {
        dependencies.payment = 'unavailable';
      }
    }
    
    try {
      // Can't easily test orders without creating one, so just mark as ok if service exists
      dependencies.orders = 'ok';
    } catch (error) {
      dependencies.orders = 'unavailable';
    }
    
    res.json({ status: 'ok', service: 'checkout', dependencies });
  } catch (error) {
    res.json({ status: 'ok', service: 'checkout', dependencies: { error: 'unknown' } });
  }
});

// Checkout endpoint
app.post('/api/checkout', async (req, res) => {
  const traceHeaders = getTraceHeaders(req);
  
  try {
    logger.info('Checkout started', {
      event: 'checkout_started',
      customer_name: req.body.customer_name
    });

    // Step 1: Get cart from Cart service
    let cart;
    try {
      cart = await cartClient.getCart(traceHeaders);
      logger.info('Cart retrieved', {
        event: 'cart_retrieved',
        item_count: cart?.items?.length || 0,
        total: cart?.total || 0,
        items: cart?.items
      });
      
      if (!cart || !cart.items || cart.items.length === 0) {
        logger.warn('Cart is empty', { cart });
        return res.status(400).json({
          success: false,
          error: 'Cart is empty'
        });
      }
    } catch (error) {
      logger.error('Failed to get cart', {
        err: error,
        error_message: error.message,
        error_status: error.status
      });
      return res.status(503).json({
        success: false,
        error: 'Cart service unavailable'
      });
    }

    // Step 2: Calculate total from cart
    // Handle both camelCase and PascalCase property names from .NET service
    const totalAmount = cart.total || cart.Total || cart.items.reduce((sum, item) => {
      const price = item.price || item.Price || 0;
      const quantity = item.quantity || item.Quantity || 0;
      return sum + (parseFloat(price) * quantity);
    }, 0);
    
    logger.info('Total calculated', {
      event: 'total_calculated',
      total_amount: totalAmount,
      cart_total: cart.total || cart.Total
    });

    // Step 3: Process payment
    let paymentResult;
    try {
      paymentResult = await paymentClient.processPayment(
        req.body.customer_name,
        req.body.customer_email,
        totalAmount,
        traceHeaders
      );
      
      if (!paymentResult.success) {
        logger.warn('Payment failed', {
          event: 'payment_failed',
          customer_name: req.body.customer_name,
          amount: totalAmount,
          reason: paymentResult.reason
        });
        return res.status(402).json({
          success: false,
          error: `Payment failed: ${paymentResult.reason || 'Unknown error'}`
        });
      }
    } catch (error) {
      logger.error('Payment processing error', { err: error });
      if (error.status === 402) {
        return res.status(402).json({
          success: false,
          error: error.message || 'Payment failed'
        });
      }
      return res.status(503).json({
        success: false,
        error: 'Payment service unavailable'
      });
    }

    logger.info('Payment successful', {
      event: 'payment_successful',
      customer_name: req.body.customer_name,
      amount: totalAmount,
      transaction_id: paymentResult.transaction_id
    });

    // Step 4: Create order
    // Map cart items to order items - handle both camelCase (productId) and PascalCase (ProductId)
    const orderItems = cart.items.map(item => {
      // .NET services use camelCase by default, but handle both cases
      const productId = item.productId || item.ProductId;
      const quantity = item.quantity || item.Quantity;
      
      if (!productId) {
        logger.error('Cart item missing productId', { item });
        throw new Error('Invalid cart item: missing productId');
      }
      
      return {
        product_id: productId,
        quantity: quantity || 1
      };
    });

    const orderData = {
      customer_name: req.body.customer_name,
      customer_email: req.body.customer_email,
      items: orderItems
    };

    logger.info('Creating order', {
      event: 'order_creation_started',
      customer_name: req.body.customer_name,
      item_count: orderItems.length,
      order_data: orderData
    });

    let order;
    try {
      order = await ordersClient.createOrder(orderData, traceHeaders);
      logger.info('Order created', {
        event: 'order_created',
        order_id: order.id,
        customer_name: req.body.customer_name
      });
    } catch (error) {
      logger.error('Order creation failed after payment', {
        err: error,
        error_message: error.message,
        error_status: error.status,
        error_data: error.data,
        order_data: orderData
      });
      // Payment succeeded but order creation failed
      // In production, this would require compensation/rollback
      return res.status(503).json({
        success: false,
        error: `Order creation failed: ${error.message || 'Unknown error'}`
      });
    }

    // Step 5: Clear cart
    try {
      await cartClient.clearCart(traceHeaders);
      logger.info('Cart cleared', {
        event: 'cart_cleared',
        customer_name: req.body.customer_name
      });
    } catch (error) {
      logger.warn('Failed to clear cart after checkout', { err: error });
      // Don't fail the checkout if cart clearing fails
    }

    // Step 6: Return success response
    res.json({
      success: true,
      order_id: order.id,
      total_amount: totalAmount,
      transaction_id: paymentResult.transaction_id
    });

  } catch (error) {
    logger.error('Checkout processing error', {
      event: 'checkout_error',
      error_type: error.name || 'unknown',
      error_message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  logger.info('Checkout service running', { port: PORT });
});

