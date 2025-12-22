import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Use relative path when API_URL is empty (for nginx proxy), otherwise use provided URL
// Use empty string for relative paths (works with nginx proxy in Kubernetes)
// For local development, set REACT_APP_API_URL=http://localhost:4000
const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [showOrders, setShowOrders] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState(null);


  const fetchProducts = async () => {
    try {
      // Instrumentation: Track product fetch
      const startTime = performance.now();
      // Products service is on a separate port/service in Docker, use same API_URL proxy
      const response = await axios.get(`${API_URL}/api/products`);
      const duration = performance.now() - startTime;
      
      // Example: window.newrelic?.addPageAction('fetchProducts', { duration });
      
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
      // Example: window.newrelic?.noticeError(error);
      setMessage('Failed to load products');
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/orders`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const searchOrder = async (e) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.trim() === '') {
      setMessage('Please enter an order ID or customer name');
      return;
    }

    setSearchLoading(true);
    setSearchResult(null);
    setMessage('');

    try {
      const response = await axios.get(`${API_URL}/api/orders/search?query=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResult(response.data);
      if (response.data && response.data.length > 0) {
        const count = response.data.length;
        setMessage(`Found ${count} order${count > 1 ? 's' : ''}`);
      } else {
        setMessage('No orders found');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        setMessage('No orders found');
        setSearchResult(null);
      } else if (error.response && error.response.status === 400) {
        setMessage(error.response.data?.error || 'Invalid search query');
        setSearchResult(null);
      } else {
        setMessage('Error searching for orders');
        console.error('Error searching orders:', error);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchCart = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/cart`);
      setCart(response.data.items || []);
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchOrders();
    fetchCart();
    
    // Refresh orders every 5 seconds
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  const addToCart = async (product) => {
    // Instrumentation: Track add to cart
    // Example: window.newrelic?.addPageAction('addToCart', { productId: product.id });
    
    try {
      await axios.post(`${API_URL}/api/cart/items`, {
        productId: product.id,
        quantity: 1
      });
      setMessage(`${product.name} added to cart!`);
      setTimeout(() => setMessage(''), 2000);
      fetchCart(); // Refresh cart
    } catch (error) {
      console.error('Error adding to cart:', error);
      setMessage('Failed to add item to cart');
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const removeFromCart = async (productId) => {
    try {
      await axios.delete(`${API_URL}/api/cart/items/${productId}`);
      fetchCart(); // Refresh cart
    } catch (error) {
      console.error('Error removing from cart:', error);
    }
  };

  const updateQuantity = async (productId, delta) => {
    try {
      const item = cart.find(item => item.productId === productId);
      if (item) {
        const newQuantity = item.quantity + delta;
        if (newQuantity > 0) {
          await axios.patch(`${API_URL}/api/cart/items/${productId}`, {
            quantity: newQuantity
          });
        } else {
          await axios.delete(`${API_URL}/api/cart/items/${productId}`);
        }
        fetchCart(); // Refresh cart
      }
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0).toFixed(2);
  };

  const handleSubmitOrder = async () => {
    if (!customerName) {
      setMessage('Please enter your name');
      return;
    }
    if (cart.length === 0) {
      setMessage('Please add items to cart');
      return;
    }

    setLoading(true);
    
    try {
      // Instrumentation: Track order submission
      const startTime = performance.now();
      // Example: window.newrelic?.addPageAction('submitOrder', { itemCount: cart.length });
      
      // Use checkout service (no need to send items, cart is managed server-side)
      const checkoutData = {
        customer_name: customerName,
        customer_email: customerEmail
      };

      const response = await axios.post(`${API_URL}/api/checkout`, checkoutData);
      const duration = performance.now() - startTime;
      
      // Example: window.newrelic?.addPageAction('checkoutCompleted', { 
      //   orderId: response.data.order_id,
      //   total: response.data.total_amount,
      //   duration 
      // });
      
      if (response.data.success) {
        setMessage(`Order #${response.data.order_id} submitted and paid successfully!`);
        setCustomerName('');
        setCustomerEmail('');
        fetchCart(); // Refresh cart (should be empty after checkout)
        fetchOrders();
      } else {
        setMessage(`Checkout failed: ${response.data.error || 'Unknown error'}`);
      }
      
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('Error during checkout:', error);
      // Example: window.newrelic?.noticeError(error);
      if (error.response && error.response.status === 402) {
        setMessage('Payment failed. Please try again.');
      } else {
        setMessage('Failed to complete checkout. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>☕ Cosmic Coffee</h1>
        <nav>
          <button 
            onClick={() => setShowOrders(!showOrders)}
            className="nav-button"
          >
            {showOrders ? 'View Menu' : `View Orders (${orders.length})`}
          </button>
        </nav>
      </header>

      {message && (
        <div className={`message ${message.includes('Failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {showOrders ? (
        <div className="orders-section">
          <h2>Recent Orders (Last 25)</h2>
          
          <div className="search-section">
            <form onSubmit={searchOrder} className="search-form">
              <input
                type="text"
                placeholder="Search by Order ID or Customer Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <button 
                type="submit" 
                disabled={searchLoading}
                className="search-button"
              >
                {searchLoading ? 'Searching...' : 'Search'}
              </button>
            </form>
          </div>

          {searchResult && searchResult.length > 0 && (
            <div className="search-results">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3>Search Result</h3>
                <button 
                  onClick={() => {
                    setSearchResult(null);
                    setSearchQuery('');
                    setMessage('');
                  }}
                  className="clear-search-button"
                >
                  Clear
                </button>
              </div>
              <div className="orders-grid">
                {searchResult.map(order => (
                  <div key={order.id} className="order-card search-result-card">
                    <div className="order-header">
                      <span className="order-id">Order #{order.id}</span>
                      <span className={`status-badge status-${order.status}`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="order-details">
                      <p><strong>Customer:</strong> {order.customer_name}</p>
                      <p><strong>Total:</strong> ${parseFloat(order.total_amount).toFixed(2)}</p>
                      <p><strong>Date:</strong> {new Date(order.created_at).toLocaleString()}</p>
                      {order.items && order.items.length > 0 && (
                        <div className="order-items">
                          <strong>Items:</strong>
                          <ul>
                            {order.items.map((item, idx) => (
                              <li key={idx}>
                                {item.product_name} x {item.quantity} - ${parseFloat(item.price).toFixed(2)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3>Recent Orders</h3>
          <div className="orders-grid">
            {orders.map(order => (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <span className="order-id">Order #{order.id}</span>
                  <span className={`status-badge status-${order.status}`}>
                    {order.status}
                  </span>
                </div>
                <div className="order-details">
                  <p><strong>Customer:</strong> {order.customer_name}</p>
                  <p><strong>Total:</strong> ${parseFloat(order.total_amount).toFixed(2)}</p>
                  <p><strong>Date:</strong> {new Date(order.created_at).toLocaleString()}</p>
                  {order.items && order.items.length > 0 && (
                    <div className="order-items">
                      <strong>Items:</strong>
                      <ul>
                        {order.items.map((item, idx) => (
                          <li key={idx}>
                            {item.product_name} x {item.quantity} - ${parseFloat(item.price).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="main-content">
            <div className="products-section">
              <h2>Menu</h2>
              <div className="products-grid">
                {products.map(product => (
                  <div key={product.id} className="product-card">
                    <div className="product-info">
                      <h3>{product.name}</h3>
                      <p className="product-description">{product.description}</p>
                      <p className="product-price">${parseFloat(product.price).toFixed(2)}</p>
                      <span className="product-category">{product.category}</span>
                    </div>
                    <button 
                      onClick={() => addToCart(product)}
                      className="add-button"
                    >
                      Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="cart-section">
              <h2>Your Order</h2>
              {cart.length === 0 ? (
                <p className="empty-cart">Your cart is empty</p>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map(item => (
                      <div key={item.productId} className="cart-item">
                        <div className="cart-item-info">
                          <span className="cart-item-name">{item.productName || `Product ${item.productId}`}</span>
                          <span className="cart-item-price">
                            ${(parseFloat(item.price || 0) * item.quantity).toFixed(2)}
                          </span>
                        </div>
                        <div className="quantity-controls">
                          <button onClick={() => updateQuantity(item.productId, -1)}>-</button>
                          <span>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.productId, 1)}>+</button>
                          <button 
                            onClick={() => removeFromCart(item.productId)}
                            className="remove-button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="cart-total">
                    <strong>Total: ${getTotal()}</strong>
                  </div>
                  <div className="customer-info">
                    <input
                      type="text"
                      placeholder="Your Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="customer-input"
                    />
                    <input
                      type="email"
                      placeholder="Your Email (optional)"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="customer-input"
                    />
                    <button
                      onClick={handleSubmitOrder}
                      disabled={loading}
                      className="submit-button"
                    >
                      {loading ? 'Submitting...' : 'Place Order'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;

