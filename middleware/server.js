// New Relic must be required first
require('newrelic');
const express = require('express');
const { Pool } = require('pg');
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
const PORT = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cosmic_coffee',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'middleware' });
});

// Process order from backend
app.post('/process-order', async (req, res) => {
  const { order_id, customer_name, total_amount } = req.body;
  
  // Log order processing start
  logger.info('Order processing started', {
    event: 'order_processing_started',
    order_id: order_id,
    customer_name: customer_name,
    total_amount: total_amount
  });
  
  try {
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Log order event
    await pool.query(
      'INSERT INTO order_events (order_id, event_type, event_data) VALUES ($1, $2, $3)',
      [order_id, 'processing_started', JSON.stringify({ 
        customer_name, 
        total_amount,
        timestamp: new Date().toISOString()
      })]
    );
    
    // Update order status to processing
    await pool.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['processing', order_id]
    );
    
    // Simulate more processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Update status to completed
    await pool.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['completed', order_id]
    );
    
    // Log completion event
    await pool.query(
      'INSERT INTO order_events (order_id, event_type, event_data) VALUES ($1, $2, $3)',
      [order_id, 'processing_completed', JSON.stringify({ 
        completed_at: new Date().toISOString()
      })]
    );
    
    // Log order processing completion
    logger.info('Order processing completed', {
      event: 'order_processing_completed',
      order_id: order_id,
      customer_name: customer_name,
      total_amount: total_amount
    });
    
    res.json({ 
      success: true, 
      message: `Order ${order_id} processed successfully`,
      order_id 
    });
  } catch (error) {
    // Log error
    logger.error('Order processing error', {
      event: 'order_processing_error',
      order_id: order_id,
      customer_name: customer_name,
      error_type: error.name || 'unknown',
      error_message: error.message,
      stack: error.stack
    });
    
    // Log error event
    try {
      await pool.query(
        'INSERT INTO order_events (order_id, event_type, event_data) VALUES ($1, $2, $3)',
        [order_id, 'processing_error', JSON.stringify({ 
          error: error.message,
          timestamp: new Date().toISOString()
        })]
      );
      
      await pool.query(
        'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['error', order_id]
      );
    } catch (dbError) {
      logger.error('Error logging error event', { err: dbError });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process order',
      message: error.message 
    });
  }
});


// Background worker to process any pending orders (optional)
setInterval(async () => {
  try {
    const result = await pool.query(
      "SELECT id FROM orders WHERE status = 'pending' AND created_at < NOW() - INTERVAL '5 seconds' LIMIT 5"
    );
    
    for (const row of result.rows) {
      logger.info('Found pending order, triggering processing', { order_id: row.id });
      // Could trigger processing here if needed
    }
  } catch (error) {
    logger.error('Error in background worker', { err: error });
  }
}, 10000); // Check every 10 seconds

app.listen(PORT, () => {
  logger.info('Middleware service running', { port: PORT });
});

