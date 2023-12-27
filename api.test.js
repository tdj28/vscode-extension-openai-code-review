jest.mock('axios');
const mockAxios = require('axios');

// Mock the 'create' method to return a mock axios instance
const mockAxiosInstance = {
  post: jest.fn(),
};
mockAxios.create.mockReturnValue(mockAxiosInstance);

const OpenAIClient = require('./api');

describe('OpenAIClient', () => {
  const apiKey = 'test-api-key';
  let client;

  beforeEach(() => {
    // Reset the mock before each test
    mockAxios.create.mockClear();
    mockAxiosInstance.post.mockClear();

    client = new OpenAIClient(apiKey);
  });

  test('should create an axios instance with the given API key', () => {
    expect(mockAxios.create).toHaveBeenCalledWith({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });
  });

  describe('post', () => {
    const endpoint = '/dummy-endpoint';
    const data = { key: 'value' };

    test('should return data on success', async () => {
      const responseData = { data: 'response data' };
      mockAxiosInstance.post.mockResolvedValueOnce(responseData);

      await expect(client.post(endpoint, data)).resolves.toEqual(responseData.data);
    });

    test('should throw an error with status on HTTP error', async () => {
      const error = {
        response: {
          status: 400,
          data: 'Bad Request',
        },
      };
      mockAxiosInstance.post.mockRejectedValueOnce(error);

      await expect(client.post(endpoint, data)).rejects.toThrow('HTTP error! status: 400');
    });

    test('should handle network or other errors', async () => {
      const error = new Error('Network Error');
      mockAxiosInstance.post.mockRejectedValueOnce(error);

      await expect(client.post(endpoint, data)).rejects.toThrow('Network Error');
    });
  });

  describe('chatCompletion', () => {
    const input = [{ role: "system", content: "You are a helpful assistant." }];
    const options = { model: 'gpt-4-1106-preview' };

    test('should call post with correct parameters', async () => {
      const postSpy = jest.spyOn(client, 'post').mockResolvedValueOnce({ choices: [{ message: 'response' }] });
      await client.chatCompletion(input, options);

      expect(postSpy).toHaveBeenCalledWith('/chat/completions', {
        model: options.model,
        messages: input,
        ...options,
      });
    });

    test('should return the first choice on success', async () => {
      const expectedResponse = { message: 'response' };
      jest.spyOn(client, 'post').mockResolvedValueOnce({ choices: [expectedResponse] });

      await expect(client.chatCompletion(input, options)).resolves.toEqual(expectedResponse);
    });

    test('should throw an error on invalid response structure', async () => {
      jest.spyOn(client, 'post').mockResolvedValueOnce({ invalid: 'structure' });

      await expect(client.chatCompletion(input, options)).rejects.toThrow('Invalid response structure from OpenAI API');
    });
  });
});
