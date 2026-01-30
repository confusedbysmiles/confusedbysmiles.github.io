// netlify/functions/generate-problem.js
// This file keeps your API key secret on the server

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    const { difficulty, context } = JSON.parse(event.body);

    // Build the prompt
    const prompt = buildPrompt(difficulty, context);

    // Call Anthropic API with YOUR secret key stored in Netlify environment variables
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,  // Stored securely in Netlify
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

function buildPrompt(difficulty, context) {
  const difficultyDescriptions = {
    basic: 'simple, straightforward calculations (like finding 20% of 50)',
    practice: 'moderate complexity with multiple steps (like calculating a tip or discount)',
    challenge: 'complex real-world scenarios requiring multiple percentage operations'
  };

  const contextDescriptions = {
    sports: 'sports, games, athletics, or competitions',
    music: 'music, concerts, streaming, or entertainment',
    gaming: 'video games, esports, streaming, or online gaming',
    cooking: 'cooking, recipes, restaurants, or food',
    money: 'money, shopping, budgets, or finances',
    social: 'social media, followers, likes, or online content'
  };

  return `Create a percentage math problem for a high school Algebra 1 student. The problem should be ${difficultyDescriptions[difficulty]}.

The problem MUST be about ${contextDescriptions[context]}.

Requirements:
- Make it engaging and relevant to teenagers
- Use realistic numbers
- Be clear and specific
- Include all necessary information to solve it

Format your response EXACTLY like this:
PROBLEM:
[Write the problem here]

ANSWER:
[Write the answer with work shown here]

Do not include any other text, labels, or formatting.`;
}
