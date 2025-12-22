// New Relic must be required first
require('newrelic');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const winston = require('winston');
const newrelicFormatter = require('@newrelic/winston-enricher')(winston);
require('dotenv').config();

// Configure Winston logger with New Relic formatter
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    newrelicFormatter()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.json()
    })
  ]
});

const app = express();
const PORT = process.env.PORT || 4000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cosmic_coffee',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  // Verify Products service connectivity
  try {
    const productsUrl = process.env.PRODUCTS_SERVICE_URL || 'http://products:4001';
    await axios.get(`${productsUrl}/health`, { timeout: 2000 });
    res.json({ status: 'ok', service: 'orders', dependencies: { products: 'ok' } });
  } catch (error) {
    res.json({ status: 'ok', service: 'orders', dependencies: { products: 'unavailable' } });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    // Simulate random unhandled exception 25% of the time for observability demo
    if (Math.random() < 0.25) {
      const error = new Error('Payment gateway timeout - unable to reach payment.giveusallyourmoney.com');
      logger.error('Order error: payment gateway timeout', {
        event: 'order_error',
        error_type: 'payment_gateway_timeout',
        error_message: error.message,
        customer_name: req.body.customer_name
      });
      throw error;
    }
    
    await client.query('BEGIN');
    
    const { customer_name, customer_email, items } = req.body;
    
    // Calculate total from items (items should already have prices from Checkout service)
    // Note: For now, we'll get prices from Products service for order_items table
    // In a production system, prices would be passed from Checkout service
    const productsUrl = process.env.PRODUCTS_SERVICE_URL || 'http://products:4001';
    const traceHeaders = {
      traceparent: req.headers.traceparent,
      tracestate: req.headers.tracestate
    };
    
    let total = 0;
    const productPrices = {};
    
    // Get product prices for order_items table (enrichment, not validation)
    for (const item of items) {
      try {
        const productResponse = await axios.get(`${productsUrl}/api/products/${item.product_id}`, {
          headers: traceHeaders,
          timeout: 5000
        });
        
        if (productResponse.data && productResponse.data.price) {
          const price = parseFloat(productResponse.data.price);
          productPrices[item.product_id] = price;
          total += price * item.quantity;
        } else {
          // If product not found, use a default price (shouldn't happen in normal flow)
          logger.warn('Product not found during order creation, using default price', { product_id: item.product_id });
          const defaultPrice = 0;
          productPrices[item.product_id] = defaultPrice;
        }
      } catch (error) {
        // Log warning but don't fail order creation (products were validated in Checkout)
        logger.warn('Error fetching product price during order creation', { 
          err: error,
          product_id: item.product_id 
        });
        const defaultPrice = 0;
        productPrices[item.product_id] = defaultPrice;
      }
    }
    
    // Create order
    const orderResult = await client.query(
      'INSERT INTO orders (customer_name, customer_email, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [customer_name, customer_email, total, 'pending']
    );
    const order = orderResult.rows[0];
    
    // Create order items with prices
    for (const item of items) {
      const price = productPrices[item.product_id] || 0;
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, item.product_id, item.quantity, price]
      );
    }
    
    await client.query('COMMIT');
    
    // Log order creation
    logger.info('Order created', {
      event: 'order_created',
      order_id: order.id,
      customer_name: customer_name,
      customer_email: customer_email,
      total_amount: total,
      item_count: items.length
    });
    
    // Send to fulfillment service for processing
    axios.post(`${process.env.FULFILLMENT_SERVICE_URL || 'http://fulfillment:5000'}/api/fulfillment/process`, {
      order_id: order.id,
      customer_name,
      total_amount: total
    }, {
      headers: traceHeaders
    }).catch(err => logger.error('Failed to notify fulfillment service', { err }));
    
    res.status(201).json(order);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Order creation failed', {
      event: 'order_error',
      error_type: error.name || 'unknown',
      error_message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to create order', message: error.message });
  } finally {
    client.release();
  }
});

// Get all orders (limited to last 25)
app.get('/api/orders', async (req, res) => {
  try {
    // Get orders and order items (without product names first)
    const result = await pool.query(`
      SELECT o.*, 
             COALESCE(json_agg(
               json_build_object(
                 'id', oi.id,
                 'product_id', oi.product_id,
                 'quantity', oi.quantity,
                 'price', oi.price
               )
             ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 25
    `);
    
    // Enrich with product names from Products service
    const productsUrl = process.env.PRODUCTS_SERVICE_URL || 'http://products:4001';
    const traceHeaders = {
      traceparent: req.headers.traceparent,
      tracestate: req.headers.tracestate
    };
    
    const enrichedOrders = await Promise.all(result.rows.map(async (order) => {
      if (order.items && order.items.length > 0) {
        const enrichedItems = await Promise.all(order.items.map(async (item) => {
          try {
            const productResponse = await axios.get(`${productsUrl}/api/products/${item.product_id}`, {
              headers: traceHeaders,
              timeout: 2000
            });
            return {
              ...item,
              product_name: productResponse.data?.name || 'Unknown Product'
            };
          } catch (error) {
            logger.warn('Failed to fetch product name', { product_id: item.product_id, err: error });
            return {
              ...item,
              product_name: 'Unknown Product'
            };
          }
        }));
        order.items = enrichedItems;
      }
      return order;
    }));
    
    res.json(enrichedOrders);
  } catch (error) {
    logger.error('Error fetching orders', { err: error });
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Search for orders by ID or customer name
app.get('/api/orders/search', async (req, res) => {
  try {
    const { orderId, customerName, query } = req.query;
    
    // Support both 'orderId', 'customerName', and generic 'query' parameter
    const searchValue = orderId || customerName || query;
    
    if (!searchValue || searchValue.trim() === '') {
      return res.status(400).json({ error: 'Search query is required (order ID or customer name)' });
    }
    
    // Determine if search is by ID (numeric) or name (text)
    const isNumericSearch = !isNaN(parseInt(searchValue)) && /^\d+$/.test(searchValue.trim());
    
    let result;
    if (isNumericSearch) {
      // Search by order ID
      result = await pool.query(`
        SELECT o.*, 
               COALESCE(json_agg(
                 json_build_object(
                   'id', oi.id,
                   'product_id', oi.product_id,
                   'quantity', oi.quantity,
                   'price', oi.price
                 )
               ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, [parseInt(searchValue)]);
    } else {
      // Search by customer name (case-insensitive partial match)
      result = await pool.query(`
        SELECT o.*, 
               COALESCE(json_agg(
                 json_build_object(
                   'id', oi.id,
                   'product_id', oi.product_id,
                   'quantity', oi.quantity,
                   'price', oi.price
                 )
               ) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE LOWER(o.customer_name) LIKE LOWER($1)
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, [`%${searchValue.trim()}%`]);
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Enrich with product names from Products service
    const productsUrl = process.env.PRODUCTS_SERVICE_URL || 'http://products:4001';
    const traceHeaders = {
      traceparent: req.headers.traceparent,
      tracestate: req.headers.tracestate
    };
    
    const order = result.rows[0];
    if (order.items && order.items.length > 0) {
      order.items = await Promise.all(order.items.map(async (item) => {
        try {
          const productResponse = await axios.get(`${productsUrl}/api/products/${item.product_id}`, {
            headers: traceHeaders,
            timeout: 2000
          });
          return {
            ...item,
            product_name: productResponse.data?.name || 'Unknown Product'
          };
        } catch (error) {
          logger.warn('Failed to fetch product name', { product_id: item.product_id, err: error });
          return {
            ...item,
            product_name: 'Unknown Product'
          };
        }
      }));
    }
    
    res.json([order]);
  } catch (error) {
    logger.error('Error searching orders', { err: error });
    res.status(500).json({ error: 'Failed to search orders' });
  }
});

// Get order by ID
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const itemsResult = await pool.query(`
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id = $1
    `, [id]);
    
    // Enrich with product names from Products service
    const productsUrl = process.env.PRODUCTS_SERVICE_URL || 'http://products:4001';
    const traceHeaders = {
      traceparent: req.headers.traceparent,
      tracestate: req.headers.tracestate
    };
    
    const enrichedItems = await Promise.all(itemsResult.rows.map(async (item) => {
      try {
        const productResponse = await axios.get(`${productsUrl}/api/products/${item.product_id}`, {
          headers: traceHeaders,
          timeout: 2000
        });
        return {
          ...item,
          product_name: productResponse.data?.name || 'Unknown Product'
        };
      } catch (error) {
        logger.warn('Failed to fetch product name', { product_id: item.product_id, err: error });
        return {
          ...item,
          product_name: 'Unknown Product'
        };
      }
    }));
    
    const order = orderResult.rows[0];
    order.items = enrichedItems;
    res.json(order);
  } catch (error) {
    logger.error('Error fetching order', { err: error });
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update order status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating order status', { err: error });
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Get order events
app.get('/api/orders/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM order_events WHERE order_id = $1 ORDER BY processed_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching order events', { err: error });
    res.status(500).json({ error: 'Failed to fetch order events' });
  }
});

// Metrics endpoint for observability
app.get('/api/metrics', async (req, res) => {
  try {
    const orderStats = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) as total_revenue
      FROM orders
      GROUP BY status
    `);
    
    const totalOrders = await pool.query('SELECT COUNT(*) as count FROM orders');
    const totalRevenue = await pool.query('SELECT SUM(total_amount) as total FROM orders WHERE status != \'cancelled\'');
    
    res.json({
      order_stats: orderStats.rows,
      total_orders: parseInt(totalOrders.rows[0].count),
      total_revenue: parseFloat(totalRevenue.rows[0].total || 0)
    });
  } catch (error) {
    logger.error('Error fetching metrics', { err: error });
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

app.listen(PORT, () => {
  logger.info('Orders service running', { port: PORT });
});
