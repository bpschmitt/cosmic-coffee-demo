const axios = require('axios');

class PaymentClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = 10000;
  }

  async processPayment(customerName, customerEmail, amount, traceHeaders = {}) {
    const url = `${this.baseUrl}/api/payment`;
    const headers = {
      'Content-Type': 'application/json',
      ...traceHeaders
    };

    const payload = {
      customer_name: customerName,
      customer_email: customerEmail,
      amount: amount
    };

    try {
      const response = await axios.post(url, payload, { headers, timeout: this.timeout });
      return response.data;
    } catch (error) {
      if (error.response) {
        // Re-throw HTTP errors with response data
        const errorData = {
          status: error.response.status,
          message: error.response.data?.detail || error.message,
          data: error.response.data
        };
        throw Object.assign(new Error(errorData.message), errorData);
      }
      throw error;
    }
  }
}

module.exports = PaymentClient;

