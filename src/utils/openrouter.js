const axios = require('axios');

/**
 * OpenRouter AI Utility for SEO and Content Generation
 */
class OpenRouter {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
  }

  async generate(prompt, systemPrompt = 'You are an expert social media strategist specializing in high-retention short-form content for YouTube Shorts, TikTok, and Facebook Reels.') {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://video-editor.local', // Required by OpenRouter
            'X-Title': 'Video Editor AI',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenRouter API Error:', error.response?.data || error.message);
      throw new Error(`AI Generation failed: ${error.message}`);
    }
  }

  /**
   * Generate a high-CTR title and a viral hook
   * @param {string} videoBrief - Brief description of the video content
   * @param {string} targetCountry - UK, France, or Germany
   */
  async generateSEO(videoBrief, targetCountry = 'UK') {
    const prompt = `
      Video Brief: ${videoBrief}
      Target Market: ${targetCountry}
      
      Please provide:
      1. A high-CTR Title using the formula: [Emotional Trigger] + [Main Keyword].
      2. A "Hook" for the first 3 seconds (start in the middle of the action, no "welcome back").
      3. A natural, keyword-rich description paragraph.
      4. 3-5 trending hashtags for ${targetCountry} (e.g., use #PourToi for France).
      
      Format the response as a JSON object:
      {
        "title": "...",
        "hook": "...",
        "description": "...",
        "hashtags": ["#tag1", "#tag2"]
      }
    `;

    const result = await this.generate(prompt);
    try {
      // Clean the response in case the AI adds markdown code blocks
      const jsonString = result.replace(/```json|```/g, '').trim();
      return JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse OpenRouter JSON response:', result);
      throw new Error('AI returned invalid JSON format');
    }
  }
}

module.exports = new OpenRouter();
