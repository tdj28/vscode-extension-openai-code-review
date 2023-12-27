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
  console.log('Creating OpenAI client...');
  const openai = createOpenAIClient(apiKey);
  console.log('OpenAI client created successfully.');

  try {
    console.log('Sending request to OpenAI API...');
    const response = await openai.post('/chat/completions', {
      model: 'gpt-4-1106-preview',
      messages: input,
      ...options,
    });
    console.log('Request successful. Data received:', response.data);
    return response.data.choices[0];
  } catch (error) {
    console.error('Error creating chat completion:', error.message);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Error data:', error.response.data);
      console.error('Error status:', error.response.status);
      console.error('Error headers:', error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up the request:', error.message);
    }
    console.error('Error config:', error.config);
    throw error;
  }
};

module.exports = { chatCompletions };