# Secure Math Problem Generator Setup

## 🔒 Why This Approach?

Your API key needs to stay SECRET. The original version exposed it in the browser, which means anyone could copy it and rack up charges on your account. This secure version hides your key on a server.

---

## 📁 New File Structure

```
your-github-repo/
├── math-generator/
│   ├── index.html
│   ├── script-secure.js (rename this to script.js)
│   ├── math-generator-styles.css
│   ├── netlify.toml
│   ├── package.json
│   └── netlify/
│       └── functions/
│           └── generate-problem.js
```

---

## 🚀 Setup Steps

### Step 1: Deploy to Netlify (Free!)

1. **Push your code to GitHub** with the folder structure above

2. **Go to [netlify.com](https://netlify.com)** and sign up (free)

3. **Click "Add new site" → "Import an existing project"**

4. **Connect to GitHub** and select your repository

5. **Configure build settings:**
   - Base directory: `math-generator`
   - Build command: (leave empty)
   - Publish directory: `.`
   - Functions directory: `netlify/functions`

6. **Click "Deploy site"**

### Step 2: Add Your Secret API Key

1. In Netlify dashboard, go to **Site settings → Environment variables**

2. **Add a new variable:**
   - Key: `ANTHROPIC_API_KEY`
   - Value: Your actual API key from console.anthropic.com

3. **Save** - Your key is now stored securely on Netlify's servers!

### Step 3: Update Your Domain

1. In Netlify, go to **Domain settings**

2. **Add custom domain:** `servellon.net` (or subdomain like `math.servellon.net`)

3. **Update your DNS** records to point to Netlify (they'll show you how)

---

## 🎯 How It Works Now

### Old Way (INSECURE):
```
Browser → Directly calls Anthropic API with exposed key ❌
```

### New Way (SECURE):
```
Browser → Your Netlify Function → Anthropic API ✅
         (No key visible)    (Key stored securely)
```

---

## 💰 Costs

- **Netlify:** FREE (100GB bandwidth, 125k function calls/month)
- **Anthropic API:** First $5 free, then ~$0.01 per problem

---

## 🧪 Testing Locally (Optional)

Want to test before deploying?

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Create a `.env` file** in your project root:
   ```
   ANTHROPIC_API_KEY=your-key-here
   ```

3. **Run locally:**
   ```bash
   netlify dev
   ```

4. **Visit:** http://localhost:8888

---

## 🔄 Alternative: Vercel (Also Free)

Don't like Netlify? Vercel works the same way:

1. Sign up at [vercel.com](https://vercel.com)
2. Import your GitHub repo
3. Add environment variable `ANTHROPIC_API_KEY`
4. Deploy!

The function code is the same, just put it in `api/generate-problem.js` instead of `netlify/functions/`.

---

## ⚠️ Important Security Notes

1. **NEVER commit `.env` files** - Add to `.gitignore`
2. **NEVER put your API key in code** that goes to GitHub
3. **Only store keys in Netlify/Vercel environment variables**
4. **Regenerate your API key** if you accidentally exposed it

---

## 🐛 Troubleshooting

**"Function not found" error:**
- Check that `netlify.toml` is in the right place
- Verify folder structure matches exactly
- Redeploy the site

**"API key not defined" error:**
- Double-check environment variable name: `ANTHROPIC_API_KEY`
- Redeploy after adding the variable

**Function timeout:**
- Anthropic API is slow sometimes, this is normal
- Free tier has 10-second timeout (usually enough)

---

## 📝 Quick Deployment Checklist

- [ ] Create folder structure with all files
- [ ] Rename `script-secure.js` to `script.js`
- [ ] Update `index.html` to reference `script.js`
- [ ] Push to GitHub
- [ ] Deploy to Netlify
- [ ] Add `ANTHROPIC_API_KEY` environment variable
- [ ] Test on your live site!

---

## 🎉 You're Done!

Your API key is now safe and sound on Netlify's servers. Students can use the app all day without ever seeing your key!

Questions? Let me know and I'll help troubleshoot.
