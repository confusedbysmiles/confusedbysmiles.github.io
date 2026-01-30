// ============================================
// CONFIGURATION - ADD YOUR API KEY HERE
// ============================================
const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE'; // Replace with your actual API key from console.anthropic.com

// ============================================
// STATE MANAGEMENT
// ============================================
let currentState = {
    difficulty: 'basic',
    context: 'sports',
    currentProblem: null,
    currentAnswer: null
};

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    difficultyButtons: document.querySelectorAll('.difficulty-btn'),
    contextButtons: document.querySelectorAll('.context-btn'),
    generateBtn: document.getElementById('generate-btn'),
    problemSection: document.getElementById('problem-section'),
    problemContent: document.getElementById('problem-content'),
    problemMeta: document.getElementById('problem-meta'),
    problemActions: document.getElementById('problem-actions'),
    answerSection: document.getElementById('answer-section'),
    answerContent: document.getElementById('answer-content'),
    showAnswerBtn: document.getElementById('show-answer-btn'),
    newProblemBtn: document.getElementById('new-problem-btn'),
    loadingOverlay: document.getElementById('loading-overlay')
};

// ============================================
// EVENT LISTENERS
// ============================================
function initializeEventListeners() {
    // Difficulty button handlers
    elements.difficultyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.difficultyButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentState.difficulty = btn.dataset.difficulty;
        });
    });

    // Context button handlers
    elements.contextButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.contextButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentState.context = btn.dataset.context;
        });
    });

    // Generate problem button
    elements.generateBtn.addEventListener('click', generateProblem);

    // Show answer button
    elements.showAnswerBtn.addEventListener('click', showAnswer);

    // New problem button
    elements.newProblemBtn.addEventListener('click', generateProblem);
}

// ============================================
// API FUNCTIONS
// ============================================
async function generateProblem() {
    // Validate API key
    if (ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') {
        alert('Please add your Anthropic API key to script.js before using this app!');
        return;
    }

    // Show loading state
    elements.loadingOverlay.style.display = 'flex';
    elements.answerSection.style.display = 'none';
    elements.showAnswerBtn.textContent = 'Show Answer';

    try {
        const prompt = buildPrompt(currentState.difficulty, currentState.context);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
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

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const result = data.content[0].text;
        
        // Parse the response to separate problem and answer
        parseProblemAndAnswer(result);
        
        // Display the problem
        displayProblem();

    } catch (error) {
        console.error('Error generating problem:', error);
        elements.problemContent.innerHTML = `
            <p style="color: #e74c3c;">Oops! Something went wrong. Please check your API key and try again.</p>
            <p style="font-size: 0.9em; color: #666;">Error: ${error.message}</p>
        `;
    } finally {
        elements.loadingOverlay.style.display = 'none';
    }
}

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

function parseProblemAndAnswer(text) {
    const problemMatch = text.match(/PROBLEM:\s*([\s\S]*?)(?=ANSWER:|$)/i);
    const answerMatch = text.match(/ANSWER:\s*([\s\S]*)/i);

    if (problemMatch && answerMatch) {
        currentState.currentProblem = problemMatch[1].trim();
        currentState.currentAnswer = answerMatch[1].trim();
    } else {
        // Fallback if format isn't perfect
        const parts = text.split(/ANSWER:/i);
        currentState.currentProblem = parts[0].replace(/PROBLEM:/i, '').trim();
        currentState.currentAnswer = parts[1] ? parts[1].trim() : 'Answer not available';
    }
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================
function displayProblem() {
    // Update meta info
    const difficultyLabel = currentState.difficulty.charAt(0).toUpperCase() + currentState.difficulty.slice(1);
    const contextLabel = currentState.context.charAt(0).toUpperCase() + currentState.context.slice(1);
    elements.problemMeta.textContent = `${difficultyLabel} • ${contextLabel}`;

    // Display problem text
    elements.problemContent.innerHTML = `<p>${currentState.currentProblem}</p>`;

    // Show action buttons
    elements.problemActions.style.display = 'flex';
}

function showAnswer() {
    if (elements.answerSection.style.display === 'none') {
        elements.answerContent.innerHTML = `<p>${currentState.currentAnswer}</p>`;
        elements.answerSection.style.display = 'block';
        elements.showAnswerBtn.textContent = 'Hide Answer';
    } else {
        elements.answerSection.style.display = 'none';
        elements.showAnswerBtn.textContent = 'Show Answer';
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    console.log('Math Problem Generator initialized!');
    console.log('Remember to add your Anthropic API key to script.js');
});
