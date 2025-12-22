const axios = require('axios');

class CartClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = 5000;
  }

  async getCart(headers = {}) {
    const url = `${this.baseUrl}/api/cart`;
    // Headers should include trace headers and cookies for session management

    try {
      const response = await axios.get(url, { headers, timeout: this.timeout });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async clearCart(headers = {}) {
    const url = `${this.baseUrl}/api/cart`;
    // Headers should include trace headers and cookies for session management

    try {
      const response = await axios.delete(url, { headers, timeout: this.timeout });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CartClient;

