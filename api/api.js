const axios = require('axios');

const BASE_URL = 'https://api.openai.com/v1';

const createOpenAIClient = (apiKey) => {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  });
};

const chatCompletions = async (apiKey, input, options = {}) => {
  const openai = createOpenAIClient(apiKey);
  try {
    const response = await openai.post('/chat/completions', {
      model: 'gpt-4-1106-preview',
      messages: input,
      ...options,
    });
    return response.data.choices[0];
  } catch (error) {
    console.error('Error creating chat completion:', error);
    throw error;
  }
};

module.exports = { chatCompletions };