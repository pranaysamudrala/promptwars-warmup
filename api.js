/**
 * ChefSync - AI API Client
 * Interfaces with either:
 * 1. The Vercel Serverless Function Proxy (/api/generate)
 * 2. Direct client-side Gemini API (if user provides local key)
 * 3. Fallback Demo Mode with highly detailed, customized mock recipes
 */

const GEMINI_MODEL = 'gemini-1.5-flash';

// Detailed structured response schema to guarantee problem statement alignment
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    mealPlan: {
      type: "object",
      properties: {
        breakfast: {
          type: "object",
          properties: {
            name: { type: "string" },
            prepTime: { type: "string" },
            cookTime: { type: "string" },
            calories: { type: "integer" },
            description: { type: "string" }
          },
          required: ["name", "prepTime", "cookTime", "calories", "description"]
        },
        lunch: {
          type: "object",
          properties: {
            name: { type: "string" },
            prepTime: { type: "string" },
            cookTime: { type: "string" },
            calories: { type: "integer" },
            description: { type: "string" }
          },
          required: ["name", "prepTime", "cookTime", "calories", "description"]
        },
        dinner: {
          type: "object",
          properties: {
            name: { type: "string" },
            prepTime: { type: "string" },
            cookTime: { type: "string" },
            calories: { type: "integer" },
            description: { type: "string" }
          },
          required: ["name", "prepTime", "cookTime", "calories", "description"]
        }
      },
      required: ["breakfast", "lunch", "dinner"]
    },
    groceryList: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          quantity: { type: "string" },
          estCost: { type: "number" }
        },
        required: ["name", "category", "quantity", "estCost"]
      }
    },
    substitutions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          substitute: { type: "string" },
          reason: { type: "string" },
          priceDiff: { type: "number" }
        },
        required: ["original", "substitute", "reason", "priceDiff"]
      }
    },
    cookingSteps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "integer" },
          meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "general-prep"] },
          instruction: { type: "string" },
          durationMinutes: { type: "integer" }
        },
        required: ["step", "meal", "instruction", "durationMinutes"]
      }
    }
  },
  required: ["mealPlan", "groceryList", "substitutions", "cookingSteps"]
};

/**
 * Main generate function
 */
export async function generateMealPlan(preferences) {
  const prompt = `
    You are an expert personal chef and meal planner. Generate a complete cooking and meal plan based on the following user profile:
    
    1. Day Profile/Schedule: ${preferences.dayProfile} (e.g. busy workday, relaxed weekend, workout day)
    2. Dietary Restrictions: ${preferences.diet || 'None'}
    3. Target Budget: $${preferences.budget} USD (Total cost of ingredients for all meals must be around or under this budget)
    4. Number of People: ${preferences.peopleCount}
    5. Additional notes: ${preferences.additionalDetails || 'None'}
    
    Guidelines:
    - Meal selections MUST align with their Day Profile. (e.g., if "busy workday", recipes should be quick, minimal prep, or make-ahead. If "relaxed weekend", more elaborate recipes).
    - Grocery costs MUST be realistic. If target budget is very low, select budget ingredients (beans, rice, simple veggies) and flag substitutions.
    - Provide a structured ingredient list with estimated costs.
    - Suggest 3-5 smart ingredient substitutions (e.g., swapping a high-cost item for a cheaper one, or vegan swaps if applicable) including the price difference.
    - Provide actionable, chronological cooking steps for all meals combined. Mark steps with prep vs cooking, and assign 'durationMinutes' (set to a number > 0 if that step requires a kitchen timer, e.g. boiling, baking, otherwise 0).
  `;

  // 1. Try Vercel Serverless Function Proxy first
  try {
    const proxyResponse = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, schema: RESPONSE_SCHEMA })
    });

    if (proxyResponse.ok) {
      const data = await proxyResponse.json();
      return { data, source: 'vercel-proxy' };
    }
    
    // If proxy exists but failed (e.g. 500 missing key), we log and try local fallback
    console.warn('Vercel proxy returned non-OK status. Falling back to local/demo checks.');
  } catch (err) {
    // Expected when running locally or on static hosts (404/network error on /api/generate)
    console.log('Vercel proxy not available or failed. Checking local API key...');
  }

  // 2. Try Client-side Gemini API directly if key is stored locally
  const localKey = localStorage.getItem('gemini_api_key');
  if (localKey && localKey.trim() !== '') {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${localKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const rawData = await response.json();
      const text = rawData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No content returned from Gemini.');
      
      const parsedData = JSON.parse(text.trim());
      return { data: parsedData, source: 'local-api' };
    } catch (apiError) {
      console.error('Local Gemini API call failed:', apiError);
      throw new Error(`Gemini API Error: ${apiError.message}`);
    }
  }

  // 3. Fallback to Demo Mode (Simulate network delay and return high-quality mock data)
  console.log('No Vercel proxy or local API key found. Launching in Demo Mode...');
  await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate AI processing delay
  
  return {
    data: getMockData(preferences),
    source: 'demo-mode'
  };
}

/**
 * Returns structured mock data matching preferences
 */
function getMockData(prefs) {
  const isVegan = prefs.diet?.toLowerCase().includes('vegan') || prefs.diet?.toLowerCase().includes('vegetarian');
  const isLowBudget = Number(prefs.budget) <= 25;
  const isBusy = prefs.dayProfile?.toLowerCase().includes('busy') || prefs.dayProfile?.toLowerCase().includes('work');
  
  // Base configuration defaults
  let breakfastName = "Avocado Toast with Poached Eggs";
  let lunchName = "Grilled Chicken Caesar Wrap";
  let dinnerName = "Pan-Seared Salmon with Asparagus";
  let groceryList = [
    { name: "Avocado", category: "Produce", quantity: "2", estCost: 3.50 },
    { name: "Eggs", category: "Dairy & Eggs", quantity: "1 dozen", estCost: 4.00 },
    { name: "Sourdough Bread", category: "Bakery", quantity: "1 loaf", estCost: 4.50 },
    { name: "Chicken Breast", category: "Meat", quantity: "500g", estCost: 8.50 },
    { name: "Caesar Dressing", category: "Pantry", quantity: "1 bottle", estCost: 3.00 },
    { name: "Tortilla Wraps", category: "Pantry", quantity: "1 pack", estCost: 2.50 },
    { name: "Salmon Fillets", category: "Seafood", quantity: "2 fillets", estCost: 15.00 },
    { name: "Asparagus", category: "Produce", quantity: "1 bunch", estCost: 4.00 },
    { name: "Olive Oil", category: "Pantry", quantity: "1 bottle", estCost: 6.00 }
  ];
  let substitutions = [
    { original: "Salmon Fillets", substitute: "Tofu Blocks", reason: "Budget-friendly / Vegan swap", priceDiff: -11.00 },
    { original: "Chicken Breast", substitute: "Canned Chickpeas", reason: "Save money or Vegan swap", priceDiff: -7.00 },
    { original: "Avocado", substitute: "Hummus", reason: "More cost-effective prep", priceDiff: -1.50 }
  ];
  let cookingSteps = [
    { step: 1, meal: "general-prep", instruction: "Wash all fresh vegetables and chop the asparagus and avocado.", durationMinutes: 0 },
    { step: 2, meal: "breakfast", instruction: "Toast the sourdough bread slices until golden brown.", durationMinutes: 3 },
    { step: 3, meal: "breakfast", instruction: "Poach or fry the eggs to your preference. Mash avocado with a pinch of salt.", durationMinutes: 5 },
    { step: 4, meal: "lunch", instruction: "Season chicken breasts and pan-fry on medium heat until fully cooked.", durationMinutes: 12 },
    { step: 5, meal: "lunch", instruction: "Warm the tortillas, slice the chicken, toss with lettuce and Caesar dressing, and roll tightly.", durationMinutes: 0 },
    { step: 6, meal: "dinner", instruction: "Preheat oven to 400°F (200°C) for roasting the asparagus.", durationMinutes: 8 },
    { step: 7, meal: "dinner", instruction: "Toss asparagus in olive oil, salt, and pepper. Roast in preheated oven.", durationMinutes: 15 },
    { step: 8, meal: "dinner", instruction: "Sear Salmon fillets in a hot skillet skin-side down first, then flip.", durationMinutes: 10 }
  ];

  // Adjustments for dietary restrictions (Vegan/Veg)
  if (isVegan) {
    breakfastName = "Smoky Tofu & Avocado Scramble";
    lunchName = "Crispy Chickpea & Avocado Wrap";
    dinnerName = "Sesame Ginger Glazed Tofu with Asparagus";
    groceryList = [
      { name: "Firm Tofu", category: "Produce", quantity: "2 blocks", estCost: 4.00 },
      { name: "Avocado", category: "Produce", quantity: "2", estCost: 3.50 },
      { name: "Sourdough Bread", category: "Bakery", quantity: "1 loaf", estCost: 4.50 },
      { name: "Canned Chickpeas", category: "Pantry", quantity: "2 cans", estCost: 2.00 },
      { name: "Vegan Caesar Dressing", category: "Pantry", quantity: "1 bottle", estCost: 4.00 },
      { name: "Tortilla Wraps", category: "Pantry", quantity: "1 pack", estCost: 2.50 },
      { name: "Asparagus", category: "Produce", quantity: "1 bunch", estCost: 4.00 },
      { name: "Olive Oil", category: "Pantry", quantity: "1 bottle", estCost: 6.00 },
      { name: "Sesame Oil & Soy Sauce", category: "Pantry", quantity: "1 bottle each", estCost: 5.00 }
    ];
    substitutions = [
      { original: "Asparagus", substitute: "Broccoli Florets", reason: "Budget savings", priceDiff: -2.00 },
      { original: "Sourdough Bread", substitute: "Whole Wheat Bread", reason: "Cost savings", priceDiff: -1.50 }
    ];
    cookingSteps = [
      { step: 1, meal: "general-prep", instruction: "Press tofu blocks to remove excess water, then slice into cubes.", durationMinutes: 10 },
      { step: 2, meal: "breakfast", instruction: "Crumble tofu into a pan, season with turmeric, garlic powder, salt, and scramble on medium heat.", durationMinutes: 8 },
      { step: 3, meal: "breakfast", instruction: "Toast the sourdough bread slices, top with mashed avocado and the tofu scramble.", durationMinutes: 0 },
      { step: 4, meal: "lunch", instruction: "Drain chickpeas, toss with olive oil, paprika, salt, and roast in a pan until crispy.", durationMinutes: 10 },
      { step: 5, meal: "lunch", instruction: "Assemble wraps: spread mashed avocado, add crispy chickpeas, and drizzle with vegan Caesar.", durationMinutes: 0 },
      { step: 6, meal: "dinner", instruction: "Toss asparagus with olive oil and roast in the oven.", durationMinutes: 12 },
      { step: 7, meal: "dinner", instruction: "Pan-sear the remaining tofu cubes, then pour the sesame ginger soy glaze into the pan to caramelize.", durationMinutes: 8 }
    ];
  }
  // Adjustments for Low Budget
  else if (isLowBudget) {
    breakfastName = "Classic Banana Oatmeal";
    lunchName = "Spiced Black Bean & Rice Bowls";
    dinnerName = "One-Pot Tomato Lentil Pasta";
    groceryList = [
      { name: "Rolled Oats", category: "Pantry", quantity: "1 bag", estCost: 2.00 },
      { name: "Bananas", category: "Produce", quantity: "1 bunch", estCost: 1.50 },
      { name: "Canned Black Beans", category: "Pantry", quantity: "2 cans", estCost: 1.80 },
      { name: "Jasmine Rice", category: "Pantry", quantity: "1 bag", estCost: 2.20 },
      { name: "Canned Tomatoes", category: "Pantry", quantity: "2 cans", estCost: 1.60 },
      { name: "Brown Lentils", category: "Pantry", quantity: "1 bag", estCost: 2.00 },
      { name: "Penne Pasta", category: "Pantry", quantity: "1 box", estCost: 1.20 },
      { name: "Onions & Garlic", category: "Produce", quantity: "1 bag each", estCost: 3.00 }
    ];
    substitutions = [
      { original: "Jasmine Rice", substitute: "Brown Rice", reason: "Higher fiber swap", priceDiff: 0.30 },
      { original: "Brown Lentils", substitute: "Canned Chickpeas", reason: "Texture variation", priceDiff: 0.50 }
    ];
    cookingSteps = [
      { step: 1, meal: "general-prep", instruction: "Dice onions and garlic for the rice bowls and pasta sauce.", durationMinutes: 0 },
      { step: 2, meal: "breakfast", instruction: "Simmer rolled oats in water or milk, top with sliced bananas and a pinch of salt.", durationMinutes: 6 },
      { step: 3, meal: "lunch", instruction: "Cook jasmine rice in a pot. Meanwhile, warm black beans with cumin, chili powder, and onion.", durationMinutes: 15 },
      { step: 4, meal: "lunch", instruction: "Assemble rice bowls: layer cooked rice, spiced beans, and a squeeze of lime if available.", durationMinutes: 0 },
      { step: 5, meal: "dinner", instruction: "In a pot, sauté onion and garlic, then add canned tomatoes, dry brown lentils, and water. Simmer until soft.", durationMinutes: 20 },
      { step: 6, meal: "dinner", instruction: "Boil water and cook penne pasta. Drain and mix with the rich tomato lentil sauce.", durationMinutes: 10 }
    ];
  }
  // Adjustments for Busy Workday (Quick & simple prep)
  else if (isBusy) {
    breakfastName = "Grab-and-Go Greek Yogurt Berry Parfait";
    lunchName = "Quick Turkey & Swiss Cheese Sandwich";
    dinnerName = "15-Minute Sheet Pan Pesto Chicken and Veggies";
    groceryList = [
      { name: "Greek Yogurt", category: "Dairy & Eggs", quantity: "1 tub", estCost: 4.50 },
      { name: "Granola", category: "Pantry", quantity: "1 bag", estCost: 3.50 },
      { name: "Mixed Berries", category: "Produce", quantity: "1 pack", estCost: 4.00 },
      { name: "Sliced Turkey Breast", category: "Deli", quantity: "1 pack", estCost: 5.00 },
      { name: "Swiss Cheese Slices", category: "Dairy & Eggs", quantity: "1 pack", estCost: 3.50 },
      { name: "Sliced Whole Wheat Bread", category: "Bakery", quantity: "1 loaf", estCost: 3.00 },
      { name: "Chicken Tenderloins", category: "Meat", quantity: "500g", estCost: 7.00 },
      { name: "Basil Pesto", category: "Pantry", quantity: "1 jar", estCost: 3.00 },
      { name: "Cherry Tomatoes & Zucchini", category: "Produce", quantity: "1 pack/each", estCost: 4.50 }
    ];
    substitutions = [
      { original: "Greek Yogurt", substitute: "Coconut Yogurt", reason: "Dairy-free swap", priceDiff: 1.50 },
      { original: "Chicken Tenderloins", substitute: "Tofu", reason: "Vegetarian option", priceDiff: -3.00 }
    ];
    cookingSteps = [
      { step: 1, meal: "breakfast", instruction: "Layer Greek yogurt, granola, and berries in a glass or jar. Eat immediately.", durationMinutes: 0 },
      { step: 2, meal: "lunch", instruction: "Assemble sandwich: spread mustard/mayo on bread, layer turkey slices and Swiss cheese.", durationMinutes: 0 },
      { step: 3, meal: "dinner", instruction: "Preheat oven to 400°F (200°C). Toss sliced zucchini and cherry tomatoes with olive oil.", durationMinutes: 5 },
      { step: 4, meal: "dinner", instruction: "Place chicken tenders and veggies on a sheet pan, coat generously with pesto, and bake.", durationMinutes: 15 }
    ];
  }

  // Adjust cost calculations based on preferences.peopleCount multiplier
  const count = Math.max(1, Number(prefs.peopleCount) || 1);
  if (count > 1) {
    groceryList.forEach(item => {
      // Scale quantities slightly less than linear to account for bulk cooking efficiency
      const multiplier = 1 + (count - 1) * 0.7;
      item.estCost = Number((item.estCost * multiplier).toFixed(2));
      item.quantity = scaleQuantity(item.quantity, multiplier);
    });
  }

  return {
    mealPlan: {
      breakfast: { name: breakfastName, prepTime: isBusy ? "3 mins" : "5 mins", cookTime: isBusy ? "0 mins" : "8 mins", calories: 420 * count, description: `A perfect energy-boosting start tailored to your ${prefs.dayProfile} schedule.` },
      lunch: { name: lunchName, prepTime: isBusy ? "4 mins" : "10 mins", cookTime: isBusy ? "0 mins" : "15 mins", calories: 580 * count, description: `Filling and nutritious midday meal designed to keep you alert.` },
      dinner: { name: dinnerName, prepTime: isBusy ? "5 mins" : "15 mins", cookTime: isBusy ? "15 mins" : "25 mins", calories: 650 * count, description: `Warm and satisfying meal to wind down after your day.` }
    },
    groceryList,
    substitutions,
    cookingSteps
  };
}

function scaleQuantity(quantity, multiplier) {
  const match = String(quantity).trim().match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return `${multiplier.toFixed(1)}× ${quantity}`;

  const scaledAmount = Number((Number(match[1]) * multiplier).toFixed(2));
  return `${scaledAmount}${match[2]}`;
}
