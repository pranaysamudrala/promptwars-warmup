import { generateMealPlan } from './api.js';

// Application State
const state = {
  currentStep: 1,
  preferences: {
    dayProfile: 'busy workday',
    diet: '',
    budget: 50,
    peopleCount: 2,
    additionalDetails: ''
  },
  plan: null,
  appliedSubstitutions: new Set(),
  groceryChecked: {},
  completedSteps: {},
  timers: {},
  apiSource: 'demo-mode'
};

// DOM Elements
const elements = {
  stepsProgress: document.getElementById('steps-progress'),
  stepNodes: document.querySelectorAll('.step-node'),
  pages: document.querySelectorAll('.wizard-page'),
  
  // Navigation Buttons
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
  
  // Step 1 Inputs
  dayProfile: document.getElementById('day-profile'),
  diet: document.getElementById('diet'),
  budget: document.getElementById('budget'),
  peopleCount: document.getElementById('people-count'),
  additionalDetails: document.getElementById('additional-details'),
  
  // Loading Panel
  loadingPanel: document.getElementById('loading-panel'),
  loadingText: document.getElementById('loading-text'),
  
  // Render Targets
  mealCardsGrid: document.getElementById('meal-cards-grid'),
  groceryListContainer: document.getElementById('grocery-list-container'),
  substitutionsGrid: document.getElementById('substitutions-grid'),
  checklistContainer: document.getElementById('checklist-container'),
  checklistProgress: document.getElementById('checklist-progress'),
  checklistProgressPercent: document.getElementById('checklist-progress-percent'),
  
  // Budget UI Elements
  budgetTotalCost: document.getElementById('budget-total-cost'),
  budgetLimitLabel: document.getElementById('budget-limit-label'),
  gaugeFill: document.getElementById('gauge-fill'),
  gaugePercentage: document.getElementById('gauge-percentage'),
  budgetVerdict: document.getElementById('budget-verdict'),
  budgetTips: document.getElementById('budget-tips'),
  
  // Settings/API Modal
  settingsTrigger: document.getElementById('settings-trigger'),
  settingsModal: document.getElementById('settings-modal'),
  settingsClose: document.getElementById('settings-close'),
  apiKeyInput: document.getElementById('api-key-input'),
  saveApiKeyBtn: document.getElementById('save-api-key'),
  removeApiKeyBtn: document.getElementById('remove-api-key'),
  apiBadge: document.getElementById('api-badge'),
  apiBadgeText: document.getElementById('api-badge-text')
};

// AudioContext for timer completion alarm (synthesized alert sound)
let audioCtx = null;
function playAlarmSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Sound pattern: 3 quick high-pitched beeps
    const playBeep = (delay, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + delay); // A5 note
      gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + duration);
    };
    playBeep(0, 0.25);
    playBeep(0.3, 0.25);
    playBeep(0.6, 0.4);
  } catch (err) {
    console.warn('AudioContext beep failed:', err);
  }
}

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateApiBadge();
  loadCachedPlan();
  goToStep(state.currentStep);
});

// Event Listeners
function setupEventListeners() {
  elements.nextBtn.addEventListener('click', handleNext);
  elements.prevBtn.addEventListener('click', handlePrev);
  
  // Settings modal
  elements.settingsTrigger.addEventListener('click', () => {
    elements.apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
    elements.settingsModal.classList.add('active');
  });
  
  elements.settingsClose.addEventListener('click', () => {
    elements.settingsModal.classList.remove('active');
  });
  
  elements.saveApiKeyBtn.addEventListener('click', () => {
    const key = elements.apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    updateApiBadge();
    elements.settingsModal.classList.remove('active');
  });

  elements.removeApiKeyBtn.addEventListener('click', () => {
    localStorage.removeItem('gemini_api_key');
    elements.apiKeyInput.value = '';
    updateApiBadge();
    elements.settingsModal.classList.remove('active');
  });
  
  // Modal overlay click
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
      elements.settingsModal.classList.remove('active');
    }
  });
}

// Update settings UI badge status
function updateApiBadge() {
  const localKey = localStorage.getItem('gemini_api_key');
  if (localKey && localKey.trim() !== '') {
    elements.apiBadge.className = 'api-badge live';
    elements.apiBadgeText.textContent = 'Live Gemini Key Configured';
  } else {
    elements.apiBadge.className = 'api-badge demo';
    elements.apiBadgeText.textContent = 'Demo Mode (Click Settings to configure API Key)';
  }
}

// Cache generated plans to prevent loss on reload
function savePlanToCache() {
  if (state.plan) {
    localStorage.setItem('chefsync_cached_plan', JSON.stringify(state.plan));
    localStorage.setItem('chefsync_cached_prefs', JSON.stringify(state.preferences));
    localStorage.setItem('chefsync_cached_source', state.apiSource);
    localStorage.setItem('chefsync_cached_progress', JSON.stringify({
      appliedSubstitutions: [...state.appliedSubstitutions],
      groceryChecked: state.groceryChecked,
      completedSteps: state.completedSteps,
      timers: Object.fromEntries(Object.entries(state.timers).map(([step, timer]) => [step, {
        timeRemaining: timer.timeRemaining,
        totalDuration: timer.totalDuration,
        // Intervals cannot survive a refresh; preserve elapsed time but resume paused.
        status: timer.status === 'complete' ? 'complete' : 'stopped'
      }]))
    }));
  }
}

function loadCachedPlan() {
  const cachedPlan = localStorage.getItem('chefsync_cached_plan');
  const cachedPrefs = localStorage.getItem('chefsync_cached_prefs');
  const cachedSource = localStorage.getItem('chefsync_cached_source');
  const cachedProgress = localStorage.getItem('chefsync_cached_progress');
  
  if (cachedPlan && cachedPrefs) {
    try {
      state.plan = JSON.parse(cachedPlan);
      state.preferences = JSON.parse(cachedPrefs);
      state.apiSource = cachedSource || 'demo-mode';
      const progress = cachedProgress ? JSON.parse(cachedProgress) : {};
      state.appliedSubstitutions = new Set(progress.appliedSubstitutions || []);
      state.groceryChecked = progress.groceryChecked || {};
      state.completedSteps = progress.completedSteps || {};
      state.timers = progress.timers || {};
      
      // Populate step 1 inputs
      elements.dayProfile.value = state.preferences.dayProfile;
      elements.diet.value = state.preferences.diet;
      elements.budget.value = state.preferences.budget;
      elements.peopleCount.value = state.preferences.peopleCount;
      elements.additionalDetails.value = state.preferences.additionalDetails;
      
      // Setup default state tracking
      resetStateTrackers(false); 
      
      // Set to step 2 automatically if there is cached data
      state.currentStep = 2;
    } catch (e) {
      console.warn('Failed to parse cached plan:', e);
    }
  }
}

// Reset state trackers on new plan generation
function resetStateTrackers(clearAll = true) {
  if (clearAll) {
    state.appliedSubstitutions.clear();
    state.groceryChecked = {};
    state.completedSteps = {};
    // Clear active timers
    Object.values(state.timers).forEach(timer => {
      if (timer.timerId) clearInterval(timer.timerId);
    });
    state.timers = {};
  }
  
  // Set up initial checkboxes and timers from plan
  if (state.plan) {
    state.plan.groceryList.forEach(item => {
      if (state.groceryChecked[item.name] === undefined) {
        state.groceryChecked[item.name] = false;
      }
    });
    
    state.plan.cookingSteps.forEach(step => {
      if (state.completedSteps[step.step] === undefined) {
        state.completedSteps[step.step] = false;
      }
      
      // Initialize cooking timers
      if (step.durationMinutes > 0 && !state.timers[step.step]) {
        state.timers[step.step] = {
          timeRemaining: step.durationMinutes * 60,
          totalDuration: step.durationMinutes * 60,
          timerId: null,
          status: 'stopped'
        };
      } else if (step.durationMinutes > 0) {
        const timer = state.timers[step.step];
        timer.totalDuration = Number(timer.totalDuration) || step.durationMinutes * 60;
        timer.timeRemaining = Math.max(0, Math.min(Number(timer.timeRemaining), timer.totalDuration));
        timer.timerId = null;
        timer.status = timer.status === 'complete' || timer.timeRemaining === 0 ? 'complete' : 'stopped';
      }
    });
  }
}

// Step Navigation Manager
function goToStep(step) {
  state.currentStep = step;
  
  // Update indicators
  elements.stepNodes.forEach((node, idx) => {
    const nodeStep = idx + 1;
    node.className = 'step-node';
    if (nodeStep === state.currentStep) {
      node.classList.add('active');
    } else if (nodeStep < state.currentStep) {
      node.classList.add('completed');
    }
  });
  
  const progressPercent = ((state.currentStep - 1) / (elements.stepNodes.length - 1)) * 100;
  elements.stepsProgress.style.width = `${progressPercent}%`;
  
  // Update views
  elements.pages.forEach((page, idx) => {
    const pageStep = idx + 1;
    if (pageStep === state.currentStep) {
      page.classList.add('active');
    } else {
      page.classList.remove('active');
    }
  });
  
  // Update Button visibility
  if (state.currentStep === 1) {
    elements.prevBtn.style.visibility = 'hidden';
    elements.nextBtn.textContent = 'Generate Meal Plan';
  } else {
    elements.prevBtn.style.visibility = 'visible';
    if (state.currentStep === 5) {
      elements.nextBtn.textContent = 'Plan New Day';
    } else {
      elements.nextBtn.textContent = 'Continue';
    }
  }
  
  // Render step specific components
  if (state.plan) {
    renderCurrentStepViews();
  }
}

function handlePrev() {
  if (state.currentStep > 1) {
    goToStep(state.currentStep - 1);
  }
}

async function handleNext() {
  if (state.currentStep === 1) {
    // Collect preferences and generate
    state.preferences = {
      dayProfile: elements.dayProfile.value,
      diet: elements.diet.value.trim(),
      budget: Number(elements.budget.value) || 50,
      peopleCount: Number(elements.peopleCount.value) || 2,
      additionalDetails: elements.additionalDetails.value.trim()
    };
    
    // UI Loading state
    elements.pages[0].classList.remove('active');
    elements.loadingPanel.classList.add('active');
    elements.loadingText.textContent = `Generating tailored recipe flow matching "${state.preferences.dayProfile}" schedule...`;
    elements.prevBtn.style.visibility = 'hidden';
    elements.nextBtn.style.visibility = 'hidden';
    
    try {
      const response = await generateMealPlan(state.preferences);
      state.plan = response.data;
      state.apiSource = response.source;
      
      resetStateTrackers(true);
      savePlanToCache();
      
      elements.loadingPanel.classList.remove('active');
      elements.prevBtn.style.visibility = 'visible';
      elements.nextBtn.style.visibility = 'visible';
      
      goToStep(2);
    } catch (err) {
      elements.loadingPanel.classList.remove('active');
      elements.pages[0].classList.add('active');
      elements.prevBtn.style.visibility = 'hidden';
      elements.nextBtn.style.visibility = 'visible';
      alert(`API Error: ${err.message}. If you are running locally without Vercel backend proxy, please click the settings icon in the top right to configure your Google Gemini API key!`);
    }
  } else if (state.currentStep === 5) {
    // Reset wizard
    localStorage.removeItem('chefsync_cached_plan');
    state.plan = null;
    goToStep(1);
  } else {
    goToStep(state.currentStep + 1);
  }
}

// Render dynamic content based on step
function renderCurrentStepViews() {
  switch (state.currentStep) {
    case 2:
      renderMeals();
      break;
    case 3:
      renderGroceryList();
      updateBudgetGauge();
      break;
    case 4:
      renderSubstitutions();
      break;
    case 5:
      renderChecklist();
      break;
  }
}

// Step 2: Render Meal Cards
function renderMeals() {
  const { breakfast, lunch, dinner } = state.plan.mealPlan;
  elements.mealCardsGrid.innerHTML = `
    <div class="meal-card">
      <span class="meal-tag breakfast">Breakfast</span>
      <h3 class="meal-name">${escapeHtml(breakfast.name)}</h3>
      <div class="meal-meta">
        <span>⏱️ Prep: ${escapeHtml(breakfast.prepTime)}</span>
        <span>🍳 Cook: ${escapeHtml(breakfast.cookTime)}</span>
        <span>🔥 ${escapeHtml(breakfast.calories)} cal</span>
      </div>
      <p class="meal-desc">${escapeHtml(breakfast.description)}</p>
    </div>
    <div class="meal-card">
      <span class="meal-tag lunch">Lunch</span>
      <h3 class="meal-name">${escapeHtml(lunch.name)}</h3>
      <div class="meal-meta">
        <span>⏱️ Prep: ${escapeHtml(lunch.prepTime)}</span>
        <span>🍳 Cook: ${escapeHtml(lunch.cookTime)}</span>
        <span>🔥 ${escapeHtml(lunch.calories)} cal</span>
      </div>
      <p class="meal-desc">${escapeHtml(lunch.description)}</p>
    </div>
    <div class="meal-card">
      <span class="meal-tag dinner">Dinner</span>
      <h3 class="meal-name">${escapeHtml(dinner.name)}</h3>
      <div class="meal-meta">
        <span>⏱️ Prep: ${escapeHtml(dinner.prepTime)}</span>
        <span>🍳 Cook: ${escapeHtml(dinner.cookTime)}</span>
        <span>🔥 ${escapeHtml(dinner.calories)} cal</span>
      </div>
      <p class="meal-desc">${escapeHtml(dinner.description)}</p>
    </div>
  `;
}

// Step 3: Render Grocery Checklist
function renderGroceryList() {
  elements.groceryListContainer.innerHTML = '';
  
  // Categorize items
  const categories = {};
  
  // Build dynamic grocery list that applies substitutions in real-time
  const activeGroceries = state.plan.groceryList.map(item => {
    const sub = Array.from(state.appliedSubstitutions)
      .map(idx => state.plan.substitutions[idx])
      .find(s => s.original.toLowerCase() === item.name.toLowerCase());
      
    if (sub) {
      return {
        name: sub.substitute,
        category: item.category,
        quantity: item.quantity,
        estCost: Math.max(0.5, Number((item.estCost + sub.priceDiff).toFixed(2))),
        isSubstituted: true,
        originalName: item.name
      };
    }
    return item;
  });
  
  activeGroceries.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });
  
  Object.keys(categories).forEach(cat => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'grocery-aisle-group';
    
    const title = document.createElement('h4');
    title.className = 'aisle-title';
    title.textContent = cat;
    groupDiv.appendChild(title);
    
    categories[cat].forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'grocery-item';
      
      const isChecked = state.groceryChecked[item.name] || false;
      
      itemDiv.innerHTML = `
        <label class="grocery-checkbox-wrapper">
          <input type="checkbox" data-name="${escapeHtml(item.name)}" ${isChecked ? 'checked' : ''}>
          <span class="grocery-name">${escapeHtml(item.name)} ${item.isSubstituted ? `<small style="color:var(--success); font-style:italic;">(Swapped from ${escapeHtml(item.originalName)})</small>` : ''} <span class="grocery-qty">${escapeHtml(item.quantity)}</span></span>
        </label>
        <span class="grocery-cost">$${item.estCost.toFixed(2)}</span>
      `;
      
      // Handle checkbox states
      const checkbox = itemDiv.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        state.groceryChecked[item.name] = e.target.checked;
        savePlanToCache();
      });
      
      groupDiv.appendChild(itemDiv);
    });
    
    elements.groceryListContainer.appendChild(groupDiv);
  });
}

// Calculate total cost applying substitutions
function calculateTotalGroceryCost() {
  let cost = 0;
  state.plan.groceryList.forEach(item => {
    // Check if substituted
    const sub = Array.from(state.appliedSubstitutions)
      .map(idx => state.plan.substitutions[idx])
      .find(s => s.original.toLowerCase() === item.name.toLowerCase());
      
    if (sub) {
      cost += Math.max(0.5, Number((item.estCost + sub.priceDiff).toFixed(2)));
    } else {
      cost += item.estCost;
    }
  });
  return Number(cost.toFixed(2));
}

// Step 3: Budget Gauge Real-Time Update
function updateBudgetGauge() {
  const targetBudget = state.preferences.budget;
  const currentTotal = calculateTotalGroceryCost();
  const percentage = Math.round((currentTotal / targetBudget) * 100);
  
  elements.budgetTotalCost.textContent = `$${currentTotal.toFixed(2)}`;
  elements.budgetLimitLabel.textContent = `of $${targetBudget.toFixed(2)} Target Budget`;
  
  // Radial Progress (circle perimeter is 2 * PI * r = 2 * 3.14 * 60 = 377 approx)
  const offset = 377 - (377 * Math.min(percentage, 100)) / 100;
  elements.gaugeFill.style.strokeDashoffset = offset;
  elements.gaugePercentage.textContent = `${percentage}%`;
  
  // Update gauge color & verdict text
  if (percentage <= 80) {
    elements.gaugeFill.style.stroke = 'var(--success)';
    elements.budgetVerdict.className = 'budget-verdict healthy';
    elements.budgetVerdict.textContent = '🎉 Under Budget!';
    elements.budgetTips.textContent = 'Awesome! Your meal plan is comfortably within budget. You can add extra treats or upgrade to organic options.';
  } else if (percentage <= 100) {
    elements.gaugeFill.style.stroke = 'var(--primary)';
    elements.budgetVerdict.className = 'budget-verdict warning';
    elements.budgetVerdict.textContent = '⚠️ Tight Budget Fit';
    elements.budgetTips.textContent = 'Close to limit. Consider applying some Smart Substitutions on the next step to secure additional savings.';
  } else {
    elements.gaugeFill.style.stroke = 'var(--danger)';
    elements.budgetVerdict.className = 'budget-verdict danger';
    elements.budgetVerdict.textContent = '🚨 Over Budget!';
    elements.budgetTips.textContent = `Exceeds target by $${(currentTotal - targetBudget).toFixed(2)}. Go to Step 4: Substitutions to swap high-cost ingredients!`;
  }
}

// Step 4: Render Substitutions Cards
function renderSubstitutions() {
  elements.substitutionsGrid.innerHTML = '';
  
  if (!state.plan.substitutions || state.plan.substitutions.length === 0) {
    elements.substitutionsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No smart substitutions needed for this plan.</div>';
    return;
  }
  
  state.plan.substitutions.forEach((sub, idx) => {
    const card = document.createElement('div');
    const isApplied = state.appliedSubstitutions.has(idx);
    
    card.className = `substitution-card ${isApplied ? 'applied' : ''}`;
    
    const priceText = sub.priceDiff < 0 
      ? `Save $${Math.abs(sub.priceDiff).toFixed(2)}`
      : `Add $${Math.abs(sub.priceDiff).toFixed(2)}`;
      
    const priceClass = sub.priceDiff < 0 ? 'save' : 'add';
    
    card.innerHTML = `
      <div class="sub-header">
        <div class="sub-labels">
          <span class="sub-label-swap">${escapeHtml(sub.original)} <span>➔</span> ${escapeHtml(sub.substitute)}</span>
        </div>
      </div>
      <p class="sub-reason">${escapeHtml(sub.reason)}</p>
      <div class="sub-action-row">
        <span class="sub-price-diff ${priceClass}">${priceText}</span>
        <button class="btn btn-secondary sub-toggle-btn">${isApplied ? 'Applied ✓' : 'Swap'}</button>
      </div>
    `;
    
    const btn = card.querySelector('.sub-toggle-btn');
    btn.addEventListener('click', () => {
      if (state.appliedSubstitutions.has(idx)) {
        state.appliedSubstitutions.delete(idx);
        btn.textContent = 'Swap';
        card.classList.remove('applied');
      } else {
        state.appliedSubstitutions.add(idx);
        btn.textContent = 'Applied ✓';
        card.classList.add('applied');
      }
      savePlanToCache();
    });
    
    elements.substitutionsGrid.appendChild(card);
  });
}

// Step 5: Render Cook checklist with timers
function renderChecklist() {
  elements.checklistContainer.innerHTML = '';
  
  state.plan.cookingSteps.forEach(step => {
    const isCompleted = state.completedSteps[step.step] || false;
    const stepDiv = document.createElement('div');
    stepDiv.className = `checklist-step ${isCompleted ? 'completed' : ''}`;
    stepDiv.id = `cook-step-${step.step}`;
    
    let timerHtml = '';
    if (step.durationMinutes > 0) {
      const timerState = state.timers[step.step];
      const minutes = Math.floor(timerState.timeRemaining / 60).toString().padStart(2, '0');
      const seconds = (timerState.timeRemaining % 60).toString().padStart(2, '0');
      const isRunning = timerState.status === 'running';
      const isFinished = timerState.status === 'complete';
      
      timerHtml = `
        <div class="timer-widget ${isRunning ? 'running' : ''} ${isFinished ? 'complete' : ''}" data-step="${step.step}">
          <button class="timer-btn timer-toggle-btn" title="${isRunning ? 'Pause' : 'Start'}">
            ${isRunning ? '⏸️' : '▶️'}
          </button>
          <span class="timer-display">${minutes}:${seconds}</span>
          <button class="timer-btn timer-reset-btn" title="Reset">
            🔄
          </button>
        </div>
      `;
    }
    
    stepDiv.innerHTML = `
      <div class="step-number" style="cursor:pointer;" title="Toggle Step Completed">${step.step}</div>
      <div class="step-details">
        <span class="step-meta-tag ${escapeHtml(step.meal)}">${escapeHtml(step.meal)}</span>
        <p class="step-instruction">${escapeHtml(step.instruction)}</p>
        ${timerHtml}
      </div>
    `;
    
    // Add checklist toggling on step number click
    const numberNode = stepDiv.querySelector('.step-number');
    numberNode.addEventListener('click', () => {
      const currentStatus = state.completedSteps[step.step];
      state.completedSteps[step.step] = !currentStatus;
      
      if (state.completedSteps[step.step]) {
        stepDiv.classList.add('completed');
        // Auto-stop timers if completed
        if (state.timers[step.step] && state.timers[step.step].status === 'running') {
          toggleTimer(step.step);
        }
      } else {
        stepDiv.classList.remove('completed');
      }
      
      updateChecklistProgress();
      savePlanToCache();
    });
    
    // Attach Timer Events
    if (step.durationMinutes > 0) {
      const playBtn = stepDiv.querySelector('.timer-toggle-btn');
      const resetBtn = stepDiv.querySelector('.timer-reset-btn');
      
      playBtn.addEventListener('click', () => toggleTimer(step.step));
      resetBtn.addEventListener('click', () => resetTimer(step.step));
    }
    
    elements.checklistContainer.appendChild(stepDiv);
  });
  
  updateChecklistProgress();
}

// Update Checklist Progress Bar
function updateChecklistProgress() {
  const total = state.plan.cookingSteps.length;
  const completed = Object.values(state.completedSteps).filter(Boolean).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  elements.checklistProgress.style.width = `${percentage}%`;
  elements.checklistProgressPercent.textContent = `${percentage}% Complete`;
}

// Kitchen Timer Engine
function toggleTimer(stepNumber) {
  const timer = state.timers[stepNumber];
  const stepCard = document.getElementById(`cook-step-${stepNumber}`);
  const widget = stepCard.querySelector('.timer-widget');
  const toggleBtn = widget.querySelector('.timer-toggle-btn');
  const display = widget.querySelector('.timer-display');
  
  if (timer.status === 'running') {
    // Pause
    clearInterval(timer.timerId);
    timer.timerId = null;
    timer.status = 'stopped';
    widget.classList.remove('running');
    toggleBtn.textContent = '▶️';
  } else {
    // Start
    timer.status = 'running';
    widget.classList.remove('complete');
    widget.classList.add('running');
    toggleBtn.textContent = '⏸️';
    
    timer.timerId = setInterval(() => {
      timer.timeRemaining--;
      
      const min = Math.floor(timer.timeRemaining / 60).toString().padStart(2, '0');
      const sec = (timer.timeRemaining % 60).toString().padStart(2, '0');
      display.textContent = `${min}:${sec}`;
      
      if (timer.timeRemaining <= 0) {
        clearInterval(timer.timerId);
        timer.timerId = null;
        timer.status = 'complete';
        widget.classList.remove('running');
        widget.classList.add('complete');
        toggleBtn.textContent = '▶️';
        playAlarmSound();
      }
    }, 1000);
  }
}

function resetTimer(stepNumber) {
  const timer = state.timers[stepNumber];
  const stepCard = document.getElementById(`cook-step-${stepNumber}`);
  const widget = stepCard.querySelector('.timer-widget');
  const toggleBtn = widget.querySelector('.timer-toggle-btn');
  const display = widget.querySelector('.timer-display');
  
  if (timer.timerId) {
    clearInterval(timer.timerId);
    timer.timerId = null;
  }
  
  timer.timeRemaining = timer.totalDuration;
  timer.status = 'stopped';
  widget.classList.remove('running');
  widget.classList.remove('complete');
  toggleBtn.textContent = '▶️';
  
  const min = Math.floor(timer.timeRemaining / 60).toString().padStart(2, '0');
  const sec = (timer.timeRemaining % 60).toString().padStart(2, '0');
  display.textContent = `${min}:${sec}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}
