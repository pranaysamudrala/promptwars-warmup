# ChefSync 🍳

**ChefSync** is a beautiful, glassmorphic client-side web application designed to optimize your culinary routine. It leverages Google Gemini AI to generate custom, daily step-by-step cooking checklists, structured meal plans, itemized grocery lists, and smart ingredient substitutions based on your schedule, diet, and budget constraints.

---

## 🌟 Key Features

1. **Daily Schedule Alignment**: Tailors meal preparation complexity to your calendar (e.g., fast <15m meals for a busy workday, or elaborate slow-cooked recipes on weekends).
2. **Dynamic Budget Feasibility**: Calculates estimated ingredient costs in real-time, matching them against your target limit via a beautiful visual budget gauge.
3. **Smart Substitutions**: Suggests alternative ingredients to shave off costs, replace allergens, or adjust to vegan/vegetarian swaps, recalculating budget impact in real-time.
4. **Active Kitchen Checklist**: Consolidates breakfast, lunch, and dinner steps into a single chronological timeline, tracking prep status with a percentage indicator.
5. **Kitchen Timers with Synthesized Alarms**: Includes inline digital timers for cooking phases, flashing warn colors and chirping a synthesized alarm upon completion (built natively with HTML5 AudioContext, zero library dependencies).
6. **Local Cache Preservation**: Safely saves your active plan, grocery checks, substitutions, checklist progress, and paused timers in browser `localStorage`, preventing data loss on page refreshes.

---

## 🛠️ Security & Architecture

ChefSync handles API keys securely using a dual-mode client/server setup:

### Mode A: Vercel Serverless Function Proxy (Production-Ready)
When deployed on Vercel:
- The backend API proxy resides at `api/generate.js`.
- It securely forwards requests to Gemini using the `GEMINI_API_KEY` set in Vercel's Environment Variables dashboard.
- **Your API key is never exposed to the client browser.**

### Mode B: Direct Client-Side Local Storage (Static Hosting Fallback)
If hosted on standard static platforms (GitHub Pages, Netlify, Surge) without a serverless backend:
- The app lets users enter their personal Gemini API Key in the top-right Settings modal.
- The key is saved locally in `localStorage` and sent directly to Google's official Gemini endpoint.

### Mode C: Zero-Config Demo Mode
If no API key is supplied, ChefSync automatically triggers **Demo Mode** using high-quality structured culinary profiles, allowing immediate evaluation of all app mechanics offline.

---

## 🚀 Getting Started

### Run Locally (Vanilla Static Serve)
Since the app uses ES Modules, it requires a local web server (running straight from the file system `file://` will block module imports due to CORS).

1. Navigate to the directory:
   ```bash
   cd promptwars-warmup
   ```
2. Start a simple HTTP server (any static server will work, e.g. python, node, php):
   - **Node.js**:
     ```bash
     npx serve .
     ```
   - **Python 3**:
     ```bash
     python3 -m http.server 8000
     ```
3. Open `http://localhost:3000` (or `http://localhost:8000`) in your web browser.

---

## 📤 Hosting & Deploying

### Option 1: Vercel (Recommended)
Vercel automatically detects the `/api` directory and builds the serverless API proxy for you.

1. Install Vercel CLI or link your GitHub repository to [Vercel](https://vercel.com).
2. Run command or trigger deployment:
   ```bash
   vercel
   ```
3. In Vercel Project Dashboard, navigate to **Settings** > **Environment Variables** and add:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: `[Your Gemini API Key]` (Get a free key from [Google AI Studio](https://aistudio.google.com/))
4. Redeploy to apply variables.

### Option 2: Netlify / GitHub Pages (Static Mode)
1. Deploy the folder contents statically.
2. Open the deployed URL, click the Gear Icon in the top-right corner, paste your Gemini API Key, and save.

---

## 📂 File Directory

- `index.html` - Core HTML skeleton with step wizards, form layouts, modal templates, and SVG icons.
- `styles.css` - Custom glassmorphic styling, progress bars, responsive grids, and active timer animations.
- `api.js` - Client-side engine querying Vercel proxy or client API with structured JSON schemas. Includes Demo Mode generator.
- `app.js` - State controller, dynamic renderer, budget calculator, checklist updates, and kitchen alarm triggers.
- `api/generate.js` - Vercel Serverless Function proxy.
