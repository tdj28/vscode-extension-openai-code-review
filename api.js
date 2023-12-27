const axios = require('axios');

class OpenAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.httpClient = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });
  }

  async post(endpoint, data) {
    try {
      const response = await this.httpClient.post(endpoint, data);
      return response.data;
    } catch (error) {
      // Check if the error has a response with a status
      if (error.response && error.response.status) {
        throw new Error(`HTTP error! status: ${error.response.status}`);
      } else {
        // Handle network errors or other errors without a response
        throw new Error(error.message || 'Network Error');
      }
    }
  }

  async chatCompletion(input, options) {
    const data = {
      model: options.model || "gpt-4-1106-preview",
      messages: input,
      ...options,
    };
  
    try {
      const response = await this.post('/chat/completions', data);
  
      // Ensure that the response has the expected structure
      if (response.choices && response.choices.length > 0) {
        return response.choices[0];
      } else {
        // Handle unexpected structure or missing data
        console.error('Unexpected response structure:', response);
        throw new Error('Invalid response structure from OpenAI API');
      }
    } catch (error) {
      console.error("Error in chatCompletion:", error);
      throw error;
    }
  }
}

module.exports = OpenAIClient;
