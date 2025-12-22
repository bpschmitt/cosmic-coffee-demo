const axios = require('axios');

class OrdersClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = 10000;
  }

  async createOrder(orderData, traceHeaders = {}) {
    const url = `${this.baseUrl}/api/orders`;
    const headers = {
      'Content-Type': 'application/json',
      ...traceHeaders
    };

    try {
      const response = await axios.post(url, orderData, { headers, timeout: this.timeout });
      return response.data;
    } catch (error) {
      if (error.response) {
        const errorData = {
          status: error.response.status,
          message: error.response.data?.error || error.message,
          data: error.response.data
        };
        throw Object.assign(new Error(errorData.message), errorData);
      }
      throw error;
    }
  }
}

module.exports = OrdersClient;

