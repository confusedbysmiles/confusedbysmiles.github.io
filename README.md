# Math Problem Generator - Setup Instructions

## 📁 Files You Have

1. **index.html** - The main HTML structure
2. **script.js** - JavaScript with API integration
3. **math-generator-styles.css** - All the styling for the app

## 🚀 Setup Steps

### 1. Get Your Anthropic API Key

1. Go to **https://console.anthropic.com**
2. Sign up or log in
3. Click **"API Keys"** in the left sidebar
4. Click **"Create Key"**
5. Name it "Math Generator"
6. **Copy the key immediately** (you won't see it again!)

### 2. Add Your API Key to the Code

Open **script.js** and find this line at the top:

```javascript
const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE';
```

Replace `YOUR_API_KEY_HERE` with your actual API key:

```javascript
const ANTHROPIC_API_KEY = 'sk-ant-api03-xxxxxxxxxxxxx';
```

### 3. Upload to Your GitHub Repository

Since you're hosting on `servellon.net` through GitHub:

1. Create a folder called `math-generator` (or whatever you want)
2. Put all three files in that folder:
   - index.html
   - script.js
   - math-generator-styles.css
3. Commit and push to GitHub
4. Your site should be live at `servellon.net/math-generator`

## 💰 API Costs

- First $5 of usage is **FREE**
- Each problem generation costs about **$0.01-0.02**
- You can generate **hundreds of problems** before paying anything
- After that, it's pay-as-you-go

## 🎨 How It Works

1. **Student picks difficulty**: Basic, Practice, or Challenge
2. **Student picks context**: Sports, Music, Gaming, Cooking, Money, or Social Media
3. **Click Generate**: Claude AI creates a custom percentage problem
4. **Show Answer**: Reveals the solution with work shown

## 🔧 Customization Ideas for Later

- Add more contexts (travel, science, fashion, etc.)
- Add more math topics (algebra, geometry, fractions)
- Save favorite problems
- Track progress over time
- Add hints before showing full answer

## ⚠️ Important Notes

- **Never commit your API key to public GitHub!** Add `script.js` to `.gitignore` or use environment variables
- Students will need internet connection to generate problems
- Each generation calls the API (costs a tiny bit of money)

## 🐛 Troubleshooting

**"Please add your Anthropic API key" error:**
- Make sure you replaced `YOUR_API_KEY_HERE` with your actual key

**Problems not generating:**
- Check browser console (F12) for errors
- Verify your API key is correct
- Check that you have API credits remaining

**Styling looks weird:**
- Make sure all three files are in the same folder
- Check that the CSS file is loading (view page source)

## 📝 Next Steps

This is Phase 1! Later we can add:
- Multiple difficulty levels with different problem types
- Answer checking (not just showing answers)
- Progress tracking
- Problem history
- Your dissertation autoethnography tracker integration!

---

Questions? Let me know and I'll help you get it running!
