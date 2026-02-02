// Fireminder: A spaced repetition app using Fibonacci intervals
// (FI-bonacci Reminder + Fire Minder 🔥🧠)
// Main App - Vue 3 Composition API with Firebase backend

// ===== IMPORTS =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, query, where, connectFirestoreEmulator 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { 
  getAuth, signInWithPopup, signInAnonymously, signOut as firebaseSignOut,
  GoogleAuthProvider, onAuthStateChanged, connectAuthEmulator 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
  FIBONACCI, getFibIndex, getFibValue, getShorterInterval, getLongerInterval,
  parseLocalDate, addInterval, daysBetween, formatDate,
  THEMES, getStoredTheme, applyTheme, formatHistoryDate,
  INTERVAL_UNITS, formatIntervalWithUnit
} from './utils.js';
import { LANDING_PAGES, getLandingPage } from './landing-pages/index.js';

// ===== FIREBASE SETUP =====
const USE_EMULATOR = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const firebaseConfig = USE_EMULATOR 
  ? { apiKey: "demo-key", authDomain: "demo-fireminder.firebaseapp.com", projectId: "demo-fireminder" }
  : {
      apiKey: "AIzaSyCX-vVV222auMSpocxd99IdAOYiVgvD2kY",
      authDomain: "fireminder-63450.firebaseapp.com",
      projectId: "fireminder-63450",
      storageBucket: "fireminder-63450.firebasestorage.app",
      messagingSenderId: "772977210766",
      appId: "1:772977210766:web:57d1a1a47aea47e878a0df",
      measurementId: "G-2SQFMP92BP"
    };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

if (USE_EMULATOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  console.log('🔥 Connected to Firebase Emulators');
} else {
  console.log('🔥 Connected to Firebase Production');
}

// ===== ENVIRONMENT DATA SEPARATION =====
// Dev and production environments use separate data paths to avoid mixing test/production data
const IS_DEV_ENVIRONMENT = window.location.hostname.startsWith('dev.');

/**
 * Get the Firestore path segments for user data based on environment.
 * Returns an array of path segments to spread into collection()/doc() calls.
 * - Production (fireminder.com): ['users', uid]
 * - Development (dev.fireminder.com): ['environments', 'dev', 'users', uid]
 * - Emulator (localhost): ['users', uid] (test data)
 */
function getUserPath(uid) {
  if (IS_DEV_ENVIRONMENT) {
    return ['environments', 'dev', 'users', uid];
  }
  return ['users', uid];
}

console.log(`📂 Data environment: ${IS_DEV_ENVIRONMENT ? 'DEVELOPMENT' : 'PRODUCTION'}`);
if (IS_DEV_ENVIRONMENT) {
  console.log('📂 Using separate dev data path: environments/dev/users/...');
}

// Apply saved theme immediately
applyTheme(getStoredTheme());

// ===== VUE APP =====
const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
  setup() {
    // ========== STATE ==========
    
    // --- Core Data ---
    const user = ref(null);
    const decks = ref([]);
    const cards = ref([]);
    const currentDeckId = ref(null);
    
    // --- UI Panels (boolean flags) ---
    const showSidebar = ref(false);
    const showAddCard = ref(false);
    const showNewDeck = ref(false);
    const showMenu = ref(false);
    const showHistory = ref(false);
    const showAllCards = ref(false);
    const showSettings = ref(false);
    const showMoveToDeck = ref(false);
    const pauseReview = ref(false); // Allows user to exit review mode while cards are due
    const showCalendar = ref(false);
    const calendarMonth = ref(new Date().getMonth());
    const calendarYear = ref(new Date().getFullYear());
    const selectedCalendarDay = ref(null); // Selected day data object
    const showThemePicker = ref(false);
    const showDatePicker = ref(false);
    const showResetConfirm = ref(false);
    
    // --- Landing Page Routing ---
    const currentLandingPage = ref(null);
    const landingPageCampaign = ref(null);
    
    // --- Content Pages ---
    const showContentPage = ref(false);
    const contentPageSlug = ref(null);
    const contentPageData = ref(null);
    const contentPageLoading = ref(false);
    const contentSearchQuery = ref('');
    const showSuggestionBox = ref(false);
    const suggestionText = ref('');
    
    // --- UI State (non-boolean) ---
    const showCardDetail = ref(null);       // Card object or null
    const showSkipToast = ref(false);
    const skippedCard = ref(null);
    let skipToastTimeout = null;
    
    // Bump feature: move card to end of queue (not skip entirely)
    const showBumpToast = ref(false);
    const bumpedCard = ref(null);
    const bumpedCardIds = ref([]);  // Cards bumped to end of queue
    let bumpToastTimeout = null;
    const showAllReflections = ref(false);
    const moveToDeckTarget = ref(null);
    const currentTheme = ref(getStoredTheme());
    
    // --- Card Detail Editing ---
    const isEditingDetail = ref(false);
    const detailEditContent = ref('');
    
    // --- Settings Form ---
    const settingsName = ref('');
    const settingsInterval = ref(2);
    const settingsIntervalUnit = ref('days');
    const settingsLimit = ref('');
    const settingsMaxNewCards = ref(1);
    
    // --- Review State ---
    const isEditing = ref(false);
    const selectedInterval = ref('default'); // 'shorter', 'default', 'longer'
    const reflectionText = ref('');
    const editedContent = ref('');
    
    // --- New Card Form ---
    const newCardContent = ref('');
    const newCardReminder = ref('');         // Optional reminder for scheduled cards
    const newCardScheduleDate = ref('');     // Optional: when card should first appear
    const newCardStartingInterval = ref(''); // Optional: override deck's starting interval
    const newCardDeckId = ref(null);
    
    // --- New Deck Form ---
    const newDeckName = ref('');
    const newDeckInterval = ref(2);
    const newDeckIntervalUnit = ref('days'); // hours, days, weeks, months, years
    const newDeckLimit = ref(null);          // null = unlimited (target cards)
    const newDeckMaxNewCards = ref(1);        // max new cards per day, default 1
    
    // --- Time Travel (Developer) ---
    const storedSimDate = localStorage.getItem('fireminder-simulated-date') || '';
    const simulatedDateRef = ref(storedSimDate);
    const storedTimeTravelStart = localStorage.getItem('fireminder-timetravel-started') || '';
    const timeTravelStartedAt = ref(storedTimeTravelStart);
    if (storedSimDate) console.log('🕐 Restored simulated date:', storedSimDate);
    
    // --- Score Debug Mode (Developer) ---
    const storedScoreDebug = localStorage.getItem('fireminder-score-debug') === 'true';
    const showScoreDebug = ref(storedScoreDebug);
    if (storedScoreDebug) console.log('📊 Score debug mode enabled');

    // --- Computed ---
    const currentDeck = computed(() => {
      if (!currentDeckId.value) return null;
      return decks.value.find(d => d.id === currentDeckId.value);
    });

    const currentDeckCards = computed(() => {
      if (!currentDeckId.value) return [];
      return cards.value.filter(c => c.deckId === currentDeckId.value);
    });

    // Dev environment detection - shows ribbon on dev.fireminder.com
    const isDevEnvironment = computed(() => {
      const hostname = window.location.hostname;
      return hostname.startsWith('dev.');
    });

    // Helper functions using reactive simulatedDateRef
    function getToday() {
      if (simulatedDateRef.value) {
        return parseLocalDate(simulatedDateRef.value);
      }
      return new Date();
    }
    
    function getTodayFormatted() {
      return formatDate(getToday());
    }
    
    const effectiveToday = computed(() => getTodayFormatted());
    const isTimeTraveling = computed(() => !!simulatedDateRef.value);

    // Store debug info about card scores
    const dueCardsDebugInfo = ref({});
    
    const dueCards = computed(() => {
      const today = effectiveToday.value;
      const deckCards = currentDeckCards.value.filter(c => !c.retired && !c.deleted && !c.skippedToday);
      
      // Split into reviewed (due) and never-reviewed (queue)
      const reviewed = deckCards.filter(c => c.lastReviewDate && c.nextDueDate <= today);
      const neverReviewed = deckCards.filter(c => !c.lastReviewDate && c.nextDueDate <= today);
      
      // Settings
      const targetCards = currentDeck.value?.queueLimit || Infinity;
      const maxNewCards = currentDeck.value?.maxNewCards ?? 1;
      
      // Debug info collection
      const debugInfo = {
        targetCards: targetCards === Infinity ? '∞' : targetCards,
        maxNewCards: maxNewCards,
        reviewedCount: reviewed.length,
        queueCount: neverReviewed.length,
        cardScores: {}
      };
      
      // Score each reviewed card: (intervalsOverdue + 1) / currentPeriod
      const scoredCards = reviewed.map(card => {
        const daysOverdue = daysBetween(card.nextDueDate, today);
        const intervalsOverdue = daysOverdue / card.currentInterval;
        const baseScore = (intervalsOverdue + 1) / card.currentInterval;
        return { 
          card, 
          score: baseScore, 
          period: card.currentInterval,
          daysOverdue: daysOverdue,
          intervalsOverdue: intervalsOverdue
        };
      });
      
      // Build queue using greedy selection with penalties
      const selected = [];
      const periodCounts = {};
      let selectionOrder = 1;
      
      while (scoredCards.length > 0) {
        // Recalculate scores with penalties
        for (const item of scoredCards) {
          const periodShown = periodCounts[item.period] || 0;
          const overTarget = Math.max(0, selected.length - targetCards + 1);
          const periodPenalty = 0.1 * periodShown;
          const overTargetPenalty = 0.1 * overTarget;
          item.adjustedScore = item.score - periodPenalty - overTargetPenalty;
          item.periodPenalty = periodPenalty;
          item.overTargetPenalty = overTargetPenalty;
        }
        
        // Sort by adjusted score descending
        scoredCards.sort((a, b) => b.adjustedScore - a.adjustedScore);
        
        // Take highest if positive
        if (scoredCards[0].adjustedScore > 0) {
          const best = scoredCards.shift();
          selected.push(best.card);
          periodCounts[best.period] = (periodCounts[best.period] || 0) + 1;
          
          // Store debug info for this card
          debugInfo.cardScores[best.card.id] = {
            order: selectionOrder++,
            type: 'reviewed',
            baseScore: best.score.toFixed(3),
            periodPenalty: best.periodPenalty.toFixed(3),
            overTargetPenalty: best.overTargetPenalty.toFixed(3),
            adjustedScore: best.adjustedScore.toFixed(3),
            interval: best.period,
            daysOverdue: best.daysOverdue,
            intervalsOverdue: best.intervalsOverdue.toFixed(2)
          };
        } else {
          // Store rejected cards' debug info
          for (const item of scoredCards) {
            debugInfo.cardScores[item.card.id] = {
              order: null,
              type: 'rejected',
              baseScore: item.score.toFixed(3),
              periodPenalty: item.periodPenalty.toFixed(3),
              overTargetPenalty: item.overTargetPenalty.toFixed(3),
              adjustedScore: item.adjustedScore.toFixed(3),
              interval: item.period,
              daysOverdue: item.daysOverdue,
              intervalsOverdue: item.intervalsOverdue.toFixed(2),
              reason: 'Score not positive'
            };
          }
          break;
        }
      }
      
      // Add new cards from queue (never-reviewed) up to maxNewCards
      // Sort by creation date (FIFO)
      neverReviewed.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      let newCardsAdded = 0;
      for (const card of neverReviewed) {
        const wouldBeAdded = selected.length < targetCards && newCardsAdded < maxNewCards;
        
        if (wouldBeAdded) {
          selected.push(card);
          newCardsAdded++;
          debugInfo.cardScores[card.id] = {
            order: selectionOrder++,
            type: 'new',
            baseScore: 'N/A',
            adjustedScore: 'N/A',
            reason: `New card #${newCardsAdded} of ${maxNewCards}`
          };
        } else {
          debugInfo.cardScores[card.id] = {
            order: null,
            type: 'queued',
            baseScore: 'N/A',
            adjustedScore: 'N/A',
            reason: selected.length >= targetCards ? 'Over target' : `Max new cards reached (${maxNewCards})`
          };
        }
      }
      
      // Sort bumped cards to the end of the queue
      const bumped = bumpedCardIds.value;
      if (bumped.length > 0) {
        selected.sort((a, b) => {
          const aIsBumped = bumped.includes(a.id);
          const bIsBumped = bumped.includes(b.id);
          if (aIsBumped && !bIsBumped) return 1;   // a goes after b
          if (!aIsBumped && bIsBumped) return -1;  // a goes before b
          return 0;  // preserve original order
        });
      }
      
      debugInfo.selectedCount = selected.length;
      dueCardsDebugInfo.value = debugInfo;
      
      return selected;
    });

    const currentCard = computed(() => {
      return dueCards.value[0] || null;
    });

    const currentInterval = computed(() => {
      if (!currentCard.value) return 2;
      return currentCard.value.currentInterval || currentDeck.value?.startingInterval || 2;
    });

    // Default next interval advances one Fibonacci step
    const defaultNextInterval = computed(() => getLongerInterval(currentInterval.value));
    // Shorter = current interval (no advance)
    const shorterInterval = computed(() => currentInterval.value);
    // Longer = advance TWO steps (one beyond default)
    const longerInterval = computed(() => getLongerInterval(defaultNextInterval.value));

    const nextInterval = computed(() => {
      if (selectedInterval.value === 'shorter') return shorterInterval.value;
      if (selectedInterval.value === 'longer') return longerInterval.value;
      return defaultNextInterval.value;
    });
    
    // Get reflections from current card's history
    const cardReflections = computed(() => {
      if (!currentCard.value?.history) return [];
      return currentCard.value.history
        .filter(h => h.reflection)
        .sort((a, b) => new Date(b.date) - new Date(a.date)); // newest first
    });

    // Calendar data
    const calendarData = computed(() => {
      const year = calendarYear.value;
      const month = calendarMonth.value;
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startDayOfWeek = firstDay.getDay();
      
      const deckCards = currentDeckCards.value.filter(c => !c.deleted);
      const today = effectiveToday.value;
      
      // Build day data
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        // Past: count reviews on this day
        const reviewedOnDay = deckCards.filter(c => 
          c.history?.some(h => h.date === dateStr)
        ).length;
        
        // Future/current: count cards due on this day
        const dueOnDay = deckCards.filter(c => 
          !c.retired && c.nextDueDate === dateStr
        ).length;
        
        days.push({
          day: d,
          date: dateStr,
          isPast: dateStr < today,
          isToday: dateStr === today,
          isFuture: dateStr > today,
          reviewedCount: reviewedOnDay,
          dueCount: dueOnDay
        });
      }
      
      return {
        year,
        month,
        monthName: new Date(year, month).toLocaleDateString('en-US', { month: 'long' }),
        startDayOfWeek,
        days
      };
    });
    
    function prevMonth() {
      if (calendarMonth.value === 0) {
        calendarMonth.value = 11;
        calendarYear.value--;
      } else {
        calendarMonth.value--;
      }
      // Clear selected day when navigating months
      selectedCalendarDay.value = null;
    }
    
    function nextMonth() {
      if (calendarMonth.value === 11) {
        calendarMonth.value = 0;
        calendarYear.value++;
      } else {
        calendarMonth.value++;
      }
      // Clear selected day when navigating months
      selectedCalendarDay.value = null;
    }
    
    // Get cards for a specific calendar day
    function getCardsForDay(dateStr) {
      const deckCards = currentDeckCards.value.filter(c => !c.deleted);
      const today = effectiveToday.value;
      const isPast = dateStr < today;
      
      if (isPast) {
        // For past days, return cards that were reviewed on this date
        return deckCards.filter(c => 
          c.history?.some(h => h.date === dateStr)
        ).map(c => {
          // Find the history entry for this date
          const historyEntry = c.history.find(h => h.date === dateStr);
          return { ...c, historyEntry };
        });
      } else {
        // For today and future, return cards due on this date
        return deckCards.filter(c => 
          !c.retired && c.nextDueDate === dateStr
        );
      }
    }
    
    // Computed: cards for selected day
    const cardsForSelectedDay = computed(() => {
      if (!selectedCalendarDay.value) return [];
      return getCardsForDay(selectedCalendarDay.value.date);
    });
    
    // Select a calendar day to show its cards
    function selectCalendarDay(day) {
      // Toggle off if clicking the same day
      if (selectedCalendarDay.value?.date === day.date) {
        selectedCalendarDay.value = null;
      } else {
        selectedCalendarDay.value = day;
      }
    }
    
    // Open card detail from calendar
    function openCardFromCalendar(card) {
      showCardDetail.value = card;
      showCalendar.value = false;
      selectedCalendarDay.value = null;
    }

    const deckStats = computed(() => {
      const deckCards = currentDeckCards.value;
      const active = deckCards.filter(c => !c.retired && !c.deleted).length;
      const retired = deckCards.filter(c => c.retired).length;
      
      // Find next due card and scheduled cards
      const today = effectiveToday.value;
      const futureCards = deckCards
        .filter(c => !c.retired && !c.deleted && c.nextDueDate > today)
        .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));
      
      // Scheduled = never reviewed and due date > today
      const scheduled = deckCards.filter(c => 
        !c.retired && !c.deleted && !c.lastReviewDate && c.nextDueDate > today
      ).length;
      
      let nextDueIn = null;
      if (futureCards.length > 0) {
        nextDueIn = daysBetween(today, futureCards[0].nextDueDate);
      }
      
      return { active, retired, scheduled, nextDueIn };
    });

    // --- Auth ---
    async function signIn() {
      try {
        if (USE_EMULATOR) {
          // Use anonymous auth in emulator for real auth token
          await signInAnonymously(auth);
        } else {
          await signInWithPopup(auth, provider);
        }
      } catch (error) {
        console.error('Sign in error:', error);
      }
    }
    
    async function signOut() {
      try {
        await firebaseSignOut(auth);
        // Clear local state
        decks.value = [];
        cards.value = [];
        currentDeckId.value = null;
        showSidebar.value = false;
      } catch (error) {
        console.error('Sign out error:', error);
      }
    }

    // --- Firestore operations ---
    async function loadDecks() {
      if (!user.value) return;
      try {
        const decksRef = collection(db, ...getUserPath(user.value.uid), 'decks');
        const snapshot = await getDocs(decksRef);
        decks.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Select first deck if none selected
        if (!currentDeckId.value && decks.value.length > 0) {
          currentDeckId.value = decks.value[0].id;
        }
      } catch (error) {
        console.error('Error loading decks:', error);
      }
    }

    async function loadCards() {
      if (!user.value || !currentDeckId.value) return;
      try {
        const cardsRef = collection(db, ...getUserPath(user.value.uid), 'cards');
        const q = query(cardsRef, where('deckId', '==', currentDeckId.value));
        const snapshot = await getDocs(q);
        cards.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        console.error('Error loading cards:', error);
      }
    }

    async function createDeck() {
      // Validate first
      if (!user.value) {
        console.error('Cannot create deck: no user');
        showNewDeck.value = false;
        return;
      }
      if (!newDeckName.value.trim()) {
        console.error('Cannot create deck: no name provided');
        // Don't close panel - let user fix the issue
        return;
      }
      
      const deckId = `deck_${Date.now()}`;
      // Sanitize queue limit: positive numbers only, otherwise null (unlimited)
      const queueLimit = (newDeckLimit.value && newDeckLimit.value > 0) ? newDeckLimit.value : null;
      const maxNewCards = (newDeckMaxNewCards.value && newDeckMaxNewCards.value > 0) ? newDeckMaxNewCards.value : 1;
      const deck = {
        name: newDeckName.value.trim(),
        startingInterval: newDeckInterval.value,
        intervalUnit: newDeckIntervalUnit.value,
        queueLimit: queueLimit,
        maxNewCards: maxNewCards,
        createdAt: formatDate(getToday()),
        createdAtReal: new Date().toISOString(), // Real timestamp for time travel discard
      };
      
      // Close panel immediately for better UX
      const deckName = newDeckName.value;
      newDeckName.value = '';
      newDeckInterval.value = 2;
      newDeckIntervalUnit.value = 'days';
      newDeckLimit.value = null;
      newDeckMaxNewCards.value = 1;
      showNewDeck.value = false;
      
      try {
        await setDoc(doc(db, ...getUserPath(user.value.uid), 'decks', deckId), deck);
        decks.value.push({ id: deckId, ...deck });
        currentDeckId.value = deckId;
      } catch (error) {
        console.error('Error creating deck:', error);
      }
    }

    async function createCard() {
      // Validate first
      if (!user.value) {
        console.error('Cannot create card: no user');
        showAddCard.value = false;
        return;
      }
      if (!newCardContent.value.trim()) {
        console.error('Cannot create card: no content');
        // Don't close panel - let user fix the issue
        return;
      }
      
      const deckId = newCardDeckId.value || currentDeckId.value;
      const deck = decks.value.find(d => d.id === deckId);
      const cardId = `card_${Date.now()}`;
      
      // Use card-specific interval if set, otherwise deck default
      const startingInterval = (newCardStartingInterval.value && newCardStartingInterval.value > 0) 
        ? parseInt(newCardStartingInterval.value) 
        : (deck?.startingInterval || 2);
      const intervalUnit = deck?.intervalUnit || 'days';
      const today = getToday();
      
      // If scheduled for a specific date, use that; otherwise use normal scheduling
      let firstDueDate;
      if (newCardScheduleDate.value) {
        // Schedule for specific date
        firstDueDate = parseLocalDate(newCardScheduleDate.value);
      } else {
        // Normal: first review after starting interval
        firstDueDate = addInterval(today, startingInterval, intervalUnit);
      }
      
      const card = {
        deckId: deckId,
        content: newCardContent.value.trim(),
        reminder: newCardReminder.value.trim() || null, // Optional reminder
        currentInterval: startingInterval,
        createdAt: formatDate(today),
        createdAtReal: new Date().toISOString(), // Real timestamp for time travel discard
        lastReviewDate: null,
        nextDueDate: formatDate(firstDueDate),
        retired: false,
        deleted: false,
        history: [],
      };
      
      // Close panel immediately for better UX
      newCardContent.value = '';
      newCardReminder.value = '';
      newCardScheduleDate.value = '';
      newCardStartingInterval.value = '';
      showAddCard.value = false;
      
      try {
        await setDoc(doc(db, ...getUserPath(user.value.uid), 'cards', cardId), card);
        cards.value.push({ id: cardId, ...card });
      } catch (error) {
        console.error('Error creating card:', error);
      }
    }

    async function reviewCard() {
      if (!currentCard.value || !user.value) return;
      
      const card = currentCard.value;
      const today = getTodayFormatted();
      const isFirstReview = !card.lastReviewDate;
      
      // Calculate overdue decay
      let newInterval = nextInterval.value;
      if (!isFirstReview && card.nextDueDate < today) {
        const overdueDays = daysBetween(card.nextDueDate, today);
        const intervalsOverdue = Math.floor(overdueDays / card.currentInterval);
        
        // Drop one Fibonacci step per interval overdue
        let idx = getFibIndex(newInterval);
        idx = Math.max(0, idx - intervalsOverdue);
        const minInterval = currentDeck.value?.startingInterval || 2;
        const minIdx = getFibIndex(minInterval);
        idx = Math.max(minIdx, idx);
        newInterval = getFibValue(idx);
      }
      
      const intervalUnit = currentDeck.value?.intervalUnit || 'days';
      const nextDue = addInterval(getToday(), newInterval, intervalUnit);
      
      // Build history entry
      const historyEntry = {
        date: today,
        interval: newInterval,
        intervalUnit: intervalUnit,
        reflection: reflectionText.value.trim() || null,
      };
      
      const updates = {
        currentInterval: newInterval,
        lastReviewDate: today,
        nextDueDate: formatDate(nextDue),
        history: [...(card.history || []), historyEntry],
      };
      
      // If content was edited
      if (isEditing.value && editedContent.value !== card.content) {
        updates.content = editedContent.value;
        historyEntry.previousContent = card.content;
      }
      
      try {
        const cardRef = doc(db, ...getUserPath(user.value.uid), 'cards', card.id);
        await setDoc(cardRef, updates, { merge: true });
        
        // Update local state
        const idx = cards.value.findIndex(c => c.id === card.id);
        if (idx !== -1) {
          cards.value[idx] = { ...cards.value[idx], ...updates };
        }
        
        // Reset state
        reflectionText.value = '';
        selectedInterval.value = 'default';
        isEditing.value = false;
        editedContent.value = '';
        showAllReflections.value = false;
        showMenu.value = false;
      } catch (error) {
        console.error('Error reviewing card:', error);
      }
    }

    // Unified card operations (work from review or detail view)
    async function retireCard(card = null) {
      // If called from @click without (), Vue passes MouseEvent - filter it out
      const inputCard = (card && card.id) ? card : null;
      const targetCard = inputCard || showCardDetail.value || currentCard.value;
      if (!targetCard || !user.value) return;
      
      try {
        const cardRef = doc(db, ...getUserPath(user.value.uid), 'cards', targetCard.id);
        await setDoc(cardRef, { retired: true }, { merge: true });
        
        const idx = cards.value.findIndex(c => c.id === targetCard.id);
        if (idx !== -1) {
          cards.value[idx].retired = true;
        }
        // Close whichever panel we're in
        showMenu.value = false;
        showCardDetail.value = null;
      } catch (error) {
        console.error('Error retiring card:', error);
      }
    }

    async function deleteCard(card = null) {
      // If called from @click without (), Vue passes MouseEvent - filter it out
      const inputCard = (card && card.id) ? card : null;
      const targetCard = inputCard || showCardDetail.value || currentCard.value;
      if (!targetCard || !user.value) return;
      if (!confirm('Delete this card permanently?')) return;
      
      try {
        const cardRef = doc(db, ...getUserPath(user.value.uid), 'cards', targetCard.id);
        await deleteDoc(cardRef);
        
        cards.value = cards.value.filter(c => c.id !== targetCard.id);
        // Close whichever panel we're in
        showMenu.value = false;
        showCardDetail.value = null;
      } catch (error) {
        console.error('Error deleting card:', error);
      }
    }

    function startEditing() {
      if (!currentCard.value) return;
      editedContent.value = currentCard.value.content;
      isEditing.value = true;
      showMenu.value = false;
    }

    function cancelEditing() {
      isEditing.value = false;
      editedContent.value = '';
    }
    
    async function saveEdit() {
      if (!currentCard.value || !user.value || !isEditing.value) return;
      if (editedContent.value === currentCard.value.content) {
        // No changes, just close
        cancelEditing();
        return;
      }
      
      try {
        const cardRef = doc(db, ...getUserPath(user.value.uid), 'cards', currentCard.value.id);
        await setDoc(cardRef, { content: editedContent.value }, { merge: true });
        
        // Update local state
        const idx = cards.value.findIndex(c => c.id === currentCard.value.id);
        if (idx !== -1) {
          cards.value[idx].content = editedContent.value;
        }
        
        isEditing.value = false;
        editedContent.value = '';
      } catch (error) {
        console.error('Error saving edit:', error);
      }
    }

    function selectDeck(deckId) {
      currentDeckId.value = deckId;
      showSidebar.value = false;
      pauseReview.value = false; // Reset pause state when switching decks
    }

    function exitReview() {
      pauseReview.value = true;
      showMenu.value = false;
    }

    function resumeReview() {
      pauseReview.value = false;
    }

    function openAddCard() {
      newCardDeckId.value = currentDeckId.value;
      showAddCard.value = true;
    }

    function applySimulatedDate(dateStr) {
      // If starting time travel (from no simulation to a date), record real timestamp
      if (dateStr && !simulatedDateRef.value) {
        const startTime = new Date().toISOString();
        timeTravelStartedAt.value = startTime;
        localStorage.setItem('fireminder-timetravel-started', startTime);
        console.log('🕐 Time travel started at:', startTime);
      }
      simulatedDateRef.value = dateStr || '';
      localStorage.setItem('fireminder-simulated-date', dateStr || '');
      console.log('🕐 Simulated date:', dateStr || 'REAL TIME');
      // Cards are automatically recalculated via reactivity
    }
    
    function clearSimulatedDate() {
      // Just clear the simulation, keep any changes made
      timeTravelStartedAt.value = '';
      localStorage.removeItem('fireminder-timetravel-started');
      applySimulatedDate('');
    }
    
    function toggleScoreDebug() {
      showScoreDebug.value = !showScoreDebug.value;
      localStorage.setItem('fireminder-score-debug', showScoreDebug.value);
      console.log('📊 Score debug mode:', showScoreDebug.value ? 'ON' : 'OFF');
    }
    
    function promptResetTimeTravel() {
      // Show confirmation modal with options
      showResetConfirm.value = true;
    }
    
    async function resetTimeTravelAndDiscard() {
      if (!timeTravelStartedAt.value || !user.value) {
        clearSimulatedDate();
        showResetConfirm.value = false;
        return;
      }
      
      const startTime = timeTravelStartedAt.value;
      console.log('🕐 Discarding changes made after:', startTime);
      
      // Delete cards created after time travel started (use real timestamp)
      const cardsToDelete = cards.value.filter(c => (c.createdAtReal || c.createdAt) > startTime);
      console.log('🕐 Cards to delete:', cardsToDelete.length);
      
      for (const card of cardsToDelete) {
        try {
          await deleteDoc(doc(db, ...getUserPath(user.value.uid), 'cards', card.id));
        } catch (err) {
          console.error('Failed to delete card:', card.id, err);
        }
      }
      
      // Delete decks created after time travel started (use real timestamp)
      const decksToDelete = decks.value.filter(d => (d.createdAtReal || d.createdAt) > startTime);
      console.log('🕐 Decks to delete:', decksToDelete.length);
      
      for (const deck of decksToDelete) {
        try {
          await deleteDoc(doc(db, ...getUserPath(user.value.uid), 'decks', deck.id));
        } catch (err) {
          console.error('Failed to delete deck:', deck.id, err);
        }
      }
      
      // Clear time travel state
      clearSimulatedDate();
      showResetConfirm.value = false;
      console.log('🕐 Time travel reset complete');
    }

    // --- Helper functions for new panels ---
    // formatHistoryDate is imported from utils.js
    
    function formatDueDate(dateStr) {
      if (!dateStr) return 'Not scheduled';
      const today = effectiveToday.value;
      if (dateStr === today) return 'Today';
      if (dateStr < today) return 'Overdue';
      
      const dueDate = new Date(dateStr);
      const todayDate = new Date(today);
      const diffDays = Math.ceil((dueDate - todayDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) return 'Tomorrow';
      return `in ${diffDays} days`;
    }
    
    function startEditingFromDetail() {
      if (!showCardDetail.value) return;
      // Set the current card to the detail card for editing
      editedContent.value = showCardDetail.value.content;
      isEditing.value = true;
      showCardDetail.value = null;
    }
    
    function startEditingDetail() {
      if (!showCardDetail.value) return;
      detailEditContent.value = showCardDetail.value.content;
      isEditingDetail.value = true;
    }
    
    function cancelDetailEdit() {
      isEditingDetail.value = false;
      detailEditContent.value = '';
    }
    
    async function saveDetailEdit() {
      if (!showCardDetail.value || !user.value) return;
      
      const newContent = detailEditContent.value.trim();
      if (!newContent) return;
      
      try {
        const cardRef = doc(db, ...getUserPath(user.value.uid), 'cards', showCardDetail.value.id);
        await setDoc(cardRef, { content: newContent }, { merge: true });
        
        // Update local state
        const idx = cards.value.findIndex(c => c.id === showCardDetail.value.id);
        if (idx !== -1) {
          cards.value[idx].content = newContent;
        }
        showCardDetail.value.content = newContent;
        
        isEditingDetail.value = false;
        detailEditContent.value = '';
      } catch (err) {
        console.error('Failed to save edit:', err);
        alert('Failed to save changes');
      }
    }
    
    // retireCardFromDetail and deleteCardFromDetail removed - use retireCard() and deleteCard()
    
    function openAllCards() {
      showAllCards.value = true;
    }
    
    function openSettings() {
      if (!currentDeck.value) return;
      settingsName.value = currentDeck.value.name;
      settingsInterval.value = currentDeck.value.startingInterval || 2;
      settingsIntervalUnit.value = currentDeck.value.intervalUnit || 'days';
      settingsLimit.value = currentDeck.value.queueLimit || '';
      settingsMaxNewCards.value = currentDeck.value.maxNewCards ?? 1;
      showSettings.value = true;
    }
    
    async function saveSettings() {
      if (!currentDeck.value || !user.value) return;
      if (!settingsName.value.trim()) return;
      
      try {
        const deckRef = doc(db, ...getUserPath(user.value.uid), 'decks', currentDeck.value.id);
        const updates = {
          name: settingsName.value.trim(),
          startingInterval: parseInt(settingsInterval.value) || 2,
          intervalUnit: settingsIntervalUnit.value || 'days',
          queueLimit: settingsLimit.value ? parseInt(settingsLimit.value) : null,
          maxNewCards: parseInt(settingsMaxNewCards.value) || 1
        };
        await setDoc(deckRef, updates, { merge: true });
        
        // Update local state
        const idx = decks.value.findIndex(d => d.id === currentDeck.value.id);
        if (idx !== -1) {
          decks.value[idx] = { ...decks.value[idx], ...updates };
        }
        
        showSettings.value = false;
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    }
    
    async function deleteDeck() {
      if (!currentDeck.value || !user.value) return;
      
      const cardsInDeck = cards.value.filter(c => c.deckId === currentDeck.value.id);
      const confirmMsg = cardsInDeck.length > 0 
        ? `Delete "${currentDeck.value.name}" and its ${cardsInDeck.length} cards?`
        : `Delete "${currentDeck.value.name}"?`;
      
      if (!confirm(confirmMsg)) return;
      
      try {
        // Delete all cards in deck
        for (const card of cardsInDeck) {
          const cardRef = doc(db, ...getUserPath(user.value.uid), 'cards', card.id);
          await deleteDoc(cardRef);
        }
        
        // Delete deck
        const deckRef = doc(db, ...getUserPath(user.value.uid), 'decks', currentDeck.value.id);
        await deleteDoc(deckRef);
        
        // Update local state
        cards.value = cards.value.filter(c => c.deckId !== currentDeck.value.id);
        decks.value = decks.value.filter(d => d.id !== currentDeck.value.id);
        currentDeckId.value = decks.value[0]?.id || null;
        
        showSettings.value = false;
      } catch (error) {
        console.error('Error deleting deck:', error);
      }
    }
    
    function exportDeck() {
      if (!currentDeck.value) return;
      
      const deck = currentDeck.value;
      const deckCards = currentDeckCards.value.filter(c => !c.deleted);
      
      // Build markdown content
      let md = `# ${deck.name}\n\n`;
      md += `- **Starting interval:** ${formatIntervalWithUnit(deck.startingInterval, deck.intervalUnit || 'days')}\n`;
      if (deck.queueLimit) {
        md += `- **Max cards/day:** ${deck.queueLimit}\n`;
      }
      md += `\n---\n\n`;
      md += `## Cards (${deckCards.length})\n\n`;
      
      deckCards.forEach((card, idx) => {
        md += `### ${idx + 1}. ${card.retired ? '[RETIRED] ' : ''}${card.content.substring(0, 50)}${card.content.length > 50 ? '...' : ''}\n\n`;
        md += `${card.content}\n\n`;
        
        if (card.history && card.history.length > 0) {
          md += `**Review history:**\n`;
          card.history.forEach(h => {
            md += `- ${h.date}: ${formatIntervalWithUnit(h.interval, h.intervalUnit || deck.intervalUnit || 'days')}`;
            if (h.reflection) {
              md += ` — "${h.reflection}"`;
            }
            md += `\n`;
          });
          md += `\n`;
        }
        
        md += `---\n\n`;
      });
      
      // Download file
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deck.name.replace(/[^a-z0-9]/gi, '-')}-export.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
    
    async function importCards(event) {
      const file = event.target.files?.[0];
      if (!file || !currentDeck.value || !user.value) return;
      
      const text = await file.text();
      
      // Simple import: each non-empty paragraph becomes a card
      // Skip lines that look like headers (start with #) or metadata (start with -)
      const lines = text.split('\n');
      const cardContents = [];
      let currentCard = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip markdown headers and metadata
        if (trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed === '---') {
          if (currentCard.trim()) {
            cardContents.push(currentCard.trim());
            currentCard = '';
          }
          continue;
        }
        
        // Skip review history lines
        if (trimmed.match(/^\d{4}-\d{2}-\d{2}:/)) {
          continue;
        }
        
        if (trimmed === '') {
          if (currentCard.trim()) {
            cardContents.push(currentCard.trim());
            currentCard = '';
          }
        } else {
          currentCard += (currentCard ? ' ' : '') + trimmed;
        }
      }
      
      if (currentCard.trim()) {
        cardContents.push(currentCard.trim());
      }
      
      // Filter duplicates and existing cards
      const existingContents = new Set(currentDeckCards.value.map(c => c.content.toLowerCase().trim()));
      const newCards = cardContents.filter(c => !existingContents.has(c.toLowerCase().trim()));
      
      if (newCards.length === 0) {
        alert('No new cards to import. All content already exists in this deck.');
        event.target.value = '';
        return;
      }
      
      const confirmMsg = `Import ${newCards.length} card${newCards.length > 1 ? 's' : ''} into "${currentDeck.value.name}"?`;
      if (!confirm(confirmMsg)) {
        event.target.value = '';
        return;
      }
      
      const startingInterval = currentDeck.value.startingInterval || 2;
      const intervalUnit = currentDeck.value.intervalUnit || 'days';
      const today = getToday();
      const firstDueDate = addInterval(today, startingInterval, intervalUnit);
      
      for (const content of newCards) {
        const cardId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const card = {
          deckId: currentDeck.value.id,
          content: content,
          currentInterval: startingInterval,
          createdAt: formatDate(today),
          createdAtReal: new Date().toISOString(),
          lastReviewDate: null,
          nextDueDate: formatDate(firstDueDate),
          retired: false,
          deleted: false,
          history: [],
        };
        
        try {
          await setDoc(doc(db, ...getUserPath(user.value.uid), 'cards', cardId), card);
          cards.value.push({ id: cardId, ...card });
        } catch (err) {
          console.error('Failed to import card:', err);
        }
      }
      
      alert(`Imported ${newCards.length} card${newCards.length > 1 ? 's' : ''} successfully!`);
      event.target.value = '';
    }

    function openMoveToDeck() {
      moveToDeckTarget.value = null;
      showMoveToDeck.value = true;
    }
    
    function skipCard() {
      if (!currentCard.value) return;
      
      // Store the skipped card for undo
      skippedCard.value = { ...currentCard.value };
      
      // Move card to end of queue (by setting a temporary skip flag)
      const idx = cards.value.findIndex(c => c.id === currentCard.value.id);
      if (idx !== -1) {
        cards.value[idx].skippedToday = true;
      }
      
      showMenu.value = false;
      showSkipToast.value = true;
      
      // Clear any existing timeout
      if (skipToastTimeout) clearTimeout(skipToastTimeout);
      
      // Auto-dismiss after 3 seconds
      skipToastTimeout = setTimeout(() => {
        showSkipToast.value = false;
        skippedCard.value = null;
      }, 3000);
    }
    
    function undoSkip() {
      if (!skippedCard.value) return;
      
      // Clear the skip flag
      const idx = cards.value.findIndex(c => c.id === skippedCard.value.id);
      if (idx !== -1) {
        cards.value[idx].skippedToday = false;
      }
      
      // Clear timeout and toast
      if (skipToastTimeout) clearTimeout(skipToastTimeout);
      showSkipToast.value = false;
      skippedCard.value = null;
    }
    
    function bumpCard() {
      if (!currentCard.value) return;
      
      // Store the bumped card for undo
      bumpedCard.value = { ...currentCard.value };
      
      // Add card ID to bumped list (moves to end of queue)
      if (!bumpedCardIds.value.includes(currentCard.value.id)) {
        bumpedCardIds.value.push(currentCard.value.id);
      }
      
      showMenu.value = false;
      showBumpToast.value = true;
      
      // Clear any existing timeout
      if (bumpToastTimeout) clearTimeout(bumpToastTimeout);
      
      // Auto-dismiss after 3 seconds
      bumpToastTimeout = setTimeout(() => {
        showBumpToast.value = false;
        bumpedCard.value = null;
      }, 3000);
    }
    
    function undoBump() {
      if (!bumpedCard.value) return;
      
      // Remove card from bumped list
      bumpedCardIds.value = bumpedCardIds.value.filter(id => id !== bumpedCard.value.id);
      
      // Clear timeout and toast
      if (bumpToastTimeout) clearTimeout(bumpToastTimeout);
      showBumpToast.value = false;
      bumpedCard.value = null;
    }
    
    async function moveCard() {
      const card = showCardDetail.value || currentCard.value;
      if (!card || !user.value || !moveToDeckTarget.value) return;
      if (moveToDeckTarget.value === card.deckId) return; // Same deck
      
      try {
        const cardRef = doc(db, ...getUserPath(user.value.uid), 'cards', card.id);
        await setDoc(cardRef, { deckId: moveToDeckTarget.value }, { merge: true });
        
        // Update local state
        const idx = cards.value.findIndex(c => c.id === card.id);
        if (idx !== -1) {
          cards.value[idx].deckId = moveToDeckTarget.value;
        }
        
        showMoveToDeck.value = false;
        showCardDetail.value = null;
      } catch (error) {
        console.error('Error moving card:', error);
      }
    }

    function setTheme(theme) {
      currentTheme.value = theme;
      applyTheme(theme);
      showThemePicker.value = false;
    }

    // --- Landing Pages & Analytics ---
    // Landing pages are now loaded from /landing-pages/*.js files
    // See landing-pages/index.js for the registry
    
    // Admin panel state
    const showAnalyticsAdmin = ref(false);
    const analyticsData = ref([]);
    const analyticsLoading = ref(false);
    const analyticsSummary = ref({});
    
    // Get visitor ID (persistent across sessions)
    function getVisitorId() {
      let visitorId = localStorage.getItem('fireminder-visitor-id');
      if (!visitorId) {
        visitorId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('fireminder-visitor-id', visitorId);
      }
      return visitorId;
    }
    
    // Analytics tracking - stores in Firestore for persistence
    async function trackEvent(eventName, data = {}) {
      const event = {
        event: eventName,
        timestamp: new Date().toISOString(),
        page: currentLandingPage.value,
        campaign: landingPageCampaign.value,
        visitorId: getVisitorId(),
        userAgent: navigator.userAgent,
        referrer: document.referrer || null,
        ...data
      };
      console.log('📊 Analytics:', event);
      
      // Store in Firestore (analytics collection at root level)
      try {
        const docId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await setDoc(doc(db, 'analytics', 'landing-pages', 'events', docId), event);
      } catch (err) {
        console.warn('Analytics storage failed (may be blocked by rules):', err.message);
      }
      
      return event;
    }
    
    async function trackPageView() {
      const isNewVisitor = !localStorage.getItem('fireminder-returning');
      await trackEvent('page_view', { isNewVisitor });
      localStorage.setItem('fireminder-returning', 'true');
    }
    
    async function trackSignup() {
      await trackEvent('signup', {});
    }
    
    function initLandingPage() {
      const hash = window.location.hash;
      const match = hash.match(/^#\/landing\/([^?]+)(\?(.*))?$/);
      
      if (match) {
        const pageName = match[1];
        const queryString = match[3] || '';
        const params = new URLSearchParams(queryString);
        
        // Use imported LANDING_PAGES from landing-pages/index.js
        const pageData = getLandingPage(pageName);
        if (pageData) {
          currentLandingPage.value = pageName;
          landingPageCampaign.value = params.get('utm_campaign') || params.get('c') || null;
          trackPageView();
        }
      }
    }
    
    function closeLandingPage() {
      currentLandingPage.value = null;
      landingPageCampaign.value = null;
      window.location.hash = '';
    }
    
    function landingPageSignup() {
      trackSignup();
      closeLandingPage();
      signIn();
    }
    
    const currentLandingPageData = computed(() => {
      if (!currentLandingPage.value) return null;
      return getLandingPage(currentLandingPage.value);
    });
    
    // Analytics Admin Functions
    async function loadAnalytics() {
      analyticsLoading.value = true;
      analyticsData.value = [];
      analyticsSummary.value = {};
      
      try {
        const eventsRef = collection(db, 'analytics', 'landing-pages', 'events');
        const snapshot = await getDocs(eventsRef);
        
        const events = [];
        snapshot.forEach(doc => {
          events.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by timestamp descending
        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        analyticsData.value = events;
        
        // Calculate summary
        const summary = {
          totalPageViews: 0,
          uniqueVisitors: new Set(),
          signups: 0,
          byPage: {},
          byCampaign: {}
        };
        
        for (const event of events) {
          if (event.event === 'page_view') {
            summary.totalPageViews++;
            if (event.visitorId) summary.uniqueVisitors.add(event.visitorId);
            
            // By page
            const page = event.page || 'unknown';
            if (!summary.byPage[page]) {
              summary.byPage[page] = { views: 0, signups: 0 };
            }
            summary.byPage[page].views++;
            
            // By campaign
            const campaign = event.campaign || '(direct)';
            if (!summary.byCampaign[campaign]) {
              summary.byCampaign[campaign] = { views: 0, signups: 0 };
            }
            summary.byCampaign[campaign].views++;
          }
          
          if (event.event === 'signup') {
            summary.signups++;
            
            const page = event.page || 'unknown';
            if (summary.byPage[page]) summary.byPage[page].signups++;
            
            const campaign = event.campaign || '(direct)';
            if (summary.byCampaign[campaign]) summary.byCampaign[campaign].signups++;
          }
        }
        
        summary.uniqueVisitorCount = summary.uniqueVisitors.size;
        delete summary.uniqueVisitors; // Don't need the Set in the template
        
        analyticsSummary.value = summary;
      } catch (err) {
        console.error('Failed to load analytics:', err);
      }
      
      analyticsLoading.value = false;
    }
    
    function openAnalyticsAdmin() {
      showAnalyticsAdmin.value = true;
      loadAnalytics();
    }
    
    function closeAnalyticsAdmin() {
      showAnalyticsAdmin.value = false;
    }
    
    // --- Content Pages ---
    const CONTENT_INDEX = {
      'faq': { title: 'FAQ', description: 'Frequently Asked Questions' },
      'getting-started': { title: 'Getting Started', description: 'How to use Fireminder' },
      'spaced-repetition': { title: 'Spaced Repetition', description: 'The science behind the system' },
      'tips': { title: 'Tips & Tricks', description: 'Get the most out of Fireminder' }
    };
    
    async function loadContentPage(slug, skipHistory = false) {
      contentPageSlug.value = slug;
      contentPageLoading.value = true;
      showContentPage.value = true;
      
      // Push to browser history for back button support
      if (!skipHistory) {
        history.pushState({ contentPage: slug }, '', `#content/${slug}`);
      }
      
      try {
        const response = await fetch(`/content/${slug}.md`);
        if (response.ok) {
          const markdown = await response.text();
          contentPageData.value = {
            ...CONTENT_INDEX[slug],
            content: parseMarkdown(markdown)
          };
        } else {
          // Fallback stub content
          contentPageData.value = {
            title: CONTENT_INDEX[slug]?.title || slug,
            description: CONTENT_INDEX[slug]?.description || '',
            content: `<p>Content coming soon! This is a stub page for "${slug}".</p>`
          };
        }
      } catch (err) {
        console.error('Failed to load content:', err);
        contentPageData.value = {
          title: 'Error',
          content: '<p>Failed to load content. Please try again.</p>'
        };
      }
      
      contentPageLoading.value = false;
    }
    
    function parseMarkdown(md) {
      // Simple markdown parser (headers, paragraphs, links, bold, italic)
      return md
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(#([^)]+)\)/g, '<a href="#" class="content-link" data-page="$2">$1</a>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(.+)$/gm, (match) => match.startsWith('<') ? match : `<p>${match}</p>`);
    }
    
    function closeContentPage(skipHistory = false) {
      showContentPage.value = false;
      contentPageSlug.value = null;
      contentPageData.value = null;
      
      // Push clean state to browser history
      if (!skipHistory) {
        history.pushState({ contentPage: null }, '', window.location.pathname);
      }
    }
    
    function openContentIndex(skipHistory = false) {
      contentPageData.value = null;
      contentPageSlug.value = null;
      showContentPage.value = true;
      
      // Push to browser history for back button support
      if (!skipHistory) {
        history.pushState({ contentPage: 'index' }, '', '#content');
      }
    }
    
    function handleContentClick(event) {
      // Handle internal content links (data-page attribute)
      const link = event.target.closest('[data-page]');
      if (link) {
        event.preventDefault();
        const slug = link.dataset.page;
        if (CONTENT_INDEX[slug]) {
          loadContentPage(slug);
        }
      }
    }
    
    function handlePopState(event) {
      const state = event.state;
      
      if (state && state.contentPage) {
        if (state.contentPage === 'index') {
          // Navigate back to content index
          contentPageData.value = null;
          contentPageSlug.value = null;
          showContentPage.value = true;
        } else {
          // Navigate to specific content page
          loadContentPage(state.contentPage, true);
        }
      } else {
        // Close content panel (navigated away from content)
        showContentPage.value = false;
        contentPageSlug.value = null;
        contentPageData.value = null;
      }
    }
    
    function goBackContent() {
      // Use browser history for back navigation
      window.history.back();
    }
    
    const filteredContentIndex = computed(() => {
      const query = contentSearchQuery.value.toLowerCase();
      if (!query) return Object.entries(CONTENT_INDEX);
      return Object.entries(CONTENT_INDEX).filter(([slug, data]) => 
        data.title.toLowerCase().includes(query) || 
        data.description.toLowerCase().includes(query)
      );
    });
    
    function submitSuggestion() {
      if (!suggestionText.value.trim()) return;
      console.log('📝 Suggestion submitted:', suggestionText.value);
      trackEvent('suggestion', { text: suggestionText.value });
      suggestionText.value = '';
      showSuggestionBox.value = false;
      alert('Thank you for your suggestion!');
    }

    // --- Lifecycle ---
    onMounted(() => {
      // Check for landing page route
      initLandingPage();
      window.addEventListener('hashchange', initLandingPage);
      
      // Listen for browser back/forward buttons (popstate)
      window.addEventListener('popstate', handlePopState);
      
      // Initialize content page from URL hash if present
      const hash = window.location.hash;
      if (hash.startsWith('#content/')) {
        const slug = hash.replace('#content/', '');
        if (CONTENT_INDEX[slug]) {
          loadContentPage(slug, true);
        }
      } else if (hash === '#content') {
        openContentIndex(true);
      }
      
      onAuthStateChanged(auth, async (firebaseUser) => {
        user.value = firebaseUser;
        if (firebaseUser) {
          await loadDecks();
        }
      });
      
      // Auto-login for emulator demo using anonymous auth
      if (USE_EMULATOR) {
        setTimeout(async () => {
          if (!user.value) {
            try {
              await signInAnonymously(auth);
              console.log('🔥 Signed in anonymously for demo');
            } catch (error) {
              console.error('Auto-login failed:', error);
            }
          }
        }, 300);
      }
    });

    // Watch for deck changes
    watch(currentDeckId, () => {
      if (currentDeckId.value) {
        loadCards();
      }
    });

    return {
      // State
      user,
      decks,
      cards,
      currentDeckId,
      currentDeck,
      currentCard,
      currentDeckCards,
      dueCards,
      isDevEnvironment,
      showSidebar,
      showAddCard,
      showNewDeck,
      showMenu,
      showHistory,
      showAllCards,
      showCardDetail,
      showSettings,
      pauseReview,
      exitReview,
      resumeReview,
      showCalendar,
      calendarData,
      calendarMonth,
      calendarYear,
      prevMonth,
      nextMonth,
      selectedCalendarDay,
      cardsForSelectedDay,
      selectCalendarDay,
      openCardFromCalendar,
      settingsName,
      settingsInterval,
      settingsIntervalUnit,
      settingsLimit,
      settingsMaxNewCards,
      INTERVAL_UNITS,
      formatIntervalWithUnit,
      openAllCards,
      openSettings,
      saveSettings,
      deleteDeck,
      showMoveToDeck,
      moveToDeckTarget,
      openMoveToDeck,
      moveCard,
      showThemePicker,
      showDatePicker,
      showSkipToast,
      skippedCard,
      skipCard,
      undoSkip,
      showBumpToast,
      bumpedCard,
      bumpedCardIds,
      bumpCard,
      undoBump,
      showAllReflections,
      cardReflections,
      simulatedDateRef,
      effectiveToday,
      isTimeTraveling,
      showScoreDebug,
      toggleScoreDebug,
      dueCardsDebugInfo,
      isEditing,
      selectedInterval,
      reflectionText,
      editedContent,
      deckStats,
      currentTheme,
      
      // Constants
      THEMES,
      
      // Form state
      newCardContent,
      newCardReminder,
      newCardScheduleDate,
      newCardStartingInterval,
      newCardDeckId,
      newDeckName,
      newDeckInterval,
      newDeckIntervalUnit,
      newDeckLimit,
      newDeckMaxNewCards,
      
      // Computed
      currentInterval,
      shorterInterval,
      longerInterval,
      nextInterval,
      
      // Methods
      signIn,
      signOut,
      createDeck,
      createCard,
      reviewCard,
      retireCard,
      deleteCard,
      startEditing,
      cancelEditing,
      saveEdit,
      startEditingFromDetail,
      formatHistoryDate,
      formatDueDate,
      selectDeck,
      openAddCard,
      setTheme,
      applySimulatedDate,
      clearSimulatedDate,
      showResetConfirm,
      promptResetTimeTravel,
      resetTimeTravelAndDiscard,
      currentLandingPage,
      currentLandingPageData,
      landingPageCampaign,
      closeLandingPage,
      landingPageSignup,
      showAnalyticsAdmin,
      analyticsData,
      analyticsLoading,
      analyticsSummary,
      openAnalyticsAdmin,
      closeAnalyticsAdmin,
      loadAnalytics,
      showContentPage,
      contentPageSlug,
      contentPageData,
      contentPageLoading,
      contentSearchQuery,
      loadContentPage,
      closeContentPage,
      openContentIndex,
      filteredContentIndex,
      showSuggestionBox,
      suggestionText,
      submitSuggestion,
      handleContentClick,
      goBackContent,
      isEditingDetail,
      detailEditContent,
      startEditingDetail,
      cancelDetailEdit,
      saveDetailEdit,
      exportDeck,
      importCards,
    };
  },

  template: `
    <div id="app">
      <!-- Landing Page Overlay (always shows when URL matches, even if logged in) -->
      <div class="landing-page" v-if="currentLandingPageData" data-testid="landing-page">
        <div class="landing-close" @click="closeLandingPage" data-testid="landing-close">✕</div>
        <div class="landing-content">
          <div class="landing-logo">🔥 Fireminder</div>
          <h1 class="landing-title">{{ currentLandingPageData.title }}</h1>
          <p class="landing-subtitle">{{ currentLandingPageData.subtitle }}</p>
          
          <!-- Features section (if defined in landing page) -->
          <div class="landing-features" v-if="currentLandingPageData.features">
            <div class="landing-feature" v-for="(feature, idx) in currentLandingPageData.features" :key="idx">
              <span class="landing-feature-icon">{{ feature.icon }}</span>
              <div class="landing-feature-text">
                <strong>{{ feature.title }}</strong>
                <span>{{ feature.description }}</span>
              </div>
            </div>
          </div>
          
          <button class="landing-cta" @click="landingPageSignup">{{ currentLandingPageData.cta }}</button>
          
          <!-- Testimonial (if defined) -->
          <div class="landing-testimonial" v-if="currentLandingPageData.testimonial">
            <p class="testimonial-text">"{{ currentLandingPageData.testimonial.text }}"</p>
            <p class="testimonial-author">— {{ currentLandingPageData.testimonial.author }}</p>
          </div>
          
          <p class="landing-skip">
            Already have an account? 
            <a href="#" @click.prevent="closeLandingPage(); signIn()">Sign in</a>
          </p>
          
          <!-- Footer text (if defined) -->
          <p class="landing-footer-text" v-if="currentLandingPageData.footer">
            {{ currentLandingPageData.footer }}
          </p>
        </div>
        <div class="landing-footer">
          <span v-if="landingPageCampaign" class="landing-campaign" data-testid="landing-campaign">Campaign: {{ landingPageCampaign }}</span>
        </div>
      </div>
      
      <!-- Sidebar Overlay -->
      <div 
        class="sidebar-overlay" 
        :class="{ open: showSidebar }"
        @click="showSidebar = false"
      ></div>
      
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ open: showSidebar }">
        <div class="sidebar-header">
          <span class="sidebar-title">Fireminder</span>
          <button class="icon-btn" @click="showSidebar = false">✕</button>
        </div>
        <div class="sidebar-content">
          <!-- Current Date Display -->
          <div class="sidebar-date">
            <div class="sidebar-date-label">Today</div>
            <div class="sidebar-date-value">{{ effectiveToday }}</div>
            <div v-if="isTimeTraveling" class="sidebar-date-simulated">
              🕐 Simulated
              <button class="btn-link" @click="promptResetTimeTravel">Reset</button>
            </div>
          </div>
          
          <template v-if="user">
            <div class="sidebar-section-title">My Decks</div>
            <ul class="deck-list">
              <li 
                v-for="deck in decks" 
                :key="deck.id"
                class="deck-item"
                :class="{ active: deck.id === currentDeckId }"
                @click="selectDeck(deck.id)"
              >
                <span class="deck-name">{{ deck.name }}</span>
                <span class="deck-count">{{ cards.filter(c => c.deckId === deck.id && !c.retired && !c.deleted).length }}</span>
              </li>
            </ul>
            <button class="new-deck-btn" @click="showNewDeck = true; showSidebar = false">
              + New Deck
            </button>
          </template>
          
          <!-- Help & Docs -->
          <button class="sidebar-action-btn" @click="openContentIndex(); showSidebar = false">
            📖 Help & Docs
          </button>
          
          <!-- Developer Section (only when logged in) -->
          <template v-if="user">
            <div class="sidebar-section-title" style="margin-top: var(--space-lg);">Developer</div>
            
            <!-- Analytics Admin -->
            <button class="sidebar-action-btn" @click="openAnalyticsAdmin(); showSidebar = false" data-testid="analytics-admin-link">
              📊 Landing Analytics
            </button>
            
            <!-- Time Travel -->
            <div class="sidebar-setting">
              <div class="sidebar-setting-label">📅 Time Travel</div>
              <input 
                type="date" 
                class="date-input"
                :value="simulatedDateRef"
                @change="applySimulatedDate($event.target.value)"
              />
            </div>
            
            <!-- Score Debug Mode -->
            <div class="sidebar-setting">
              <div class="sidebar-setting-label">📊 Show Scores</div>
              <label class="toggle-switch">
                <input type="checkbox" :checked="showScoreDebug" @change="toggleScoreDebug">
                <span class="toggle-slider"></span>
              </label>
            </div>
            
            <!-- Theme Picker -->
            <div class="sidebar-setting">
              <div class="sidebar-setting-label">🎨 Theme</div>
              <div class="theme-picker-inline">
                <button 
                  v-for="theme in THEMES" 
                  :key="theme"
                  class="theme-swatch"
                  :class="{ active: currentTheme === theme }"
                  :data-theme="theme"
                  :title="theme"
                  @click="setTheme(theme)"
                ></button>
              </div>
            </div>
            
            <!-- Sign Out -->
            <div class="sidebar-footer">
              <div class="sidebar-user">
                {{ user.displayName || user.email || 'Anonymous' }}
              </div>
              <button class="btn-signout" @click="signOut">Sign Out</button>
            </div>
          </template>
        </div>
      </aside>

      <!-- Dev Environment Ribbon -->
      <div v-if="isDevEnvironment" class="dev-ribbon">
        🔬 DEV ENVIRONMENT - Data is separate from production
      </div>

      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <button class="icon-btn" @click="showSidebar = true">≡</button>
          <span class="header-title" v-if="currentDeck">{{ currentDeck.name }}</span>
          <span class="header-title" v-else>Fireminder</span>
        </div>
        <div class="header-right" v-if="user">
          <button class="btn-new-card" @click="openAddCard">New Card</button>
        </div>
      </header>

      <!-- Time Travel Banner -->
      <div v-if="isTimeTraveling" class="time-travel-banner">
        🕐 Simulating: {{ effectiveToday }}
        <button class="btn-reset" @click="promptResetTimeTravel">← Back to today</button>
      </div>

      <!-- Main Content -->
      <main class="main" v-if="user">
        <!-- No decks state -->
        <div v-if="decks.length === 0" class="empty-state">
          <p style="margin-bottom: 1rem;">Welcome! Create your first deck to get started.</p>
          <button class="btn-primary" @click="showNewDeck = true">Create Deck</button>
        </div>

        <!-- Review Card (only if not paused) -->
        <template v-else-if="currentCard && !pauseReview">
          <div class="card">
            <div v-if="isEditing" class="card-editing">
              <div style="color: var(--accent); font-size: 0.85rem; margin-bottom: 0.5rem;">✎ EDITING</div>
              <textarea 
                class="reflection-input" 
                style="min-height: 150px; font-family: var(--font-display); font-size: 1.3rem;"
                v-model="editedContent"
              ></textarea>
            </div>
            <div v-else class="card-content">{{ currentCard.content }}</div>
            
            <!-- Show reminder on first review -->
            <div v-if="!isEditing && !currentCard.lastReviewDate && currentCard.reminder" class="card-reminder">
              <div class="reminder-label">📝 Reminder:</div>
              <div class="reminder-text">{{ currentCard.reminder }}</div>
            </div>
          </div>
          
          <!-- Past Reflections (hidden by default to encourage fresh reflection) -->
          <div class="past-reflections" v-if="!isEditing && cardReflections.length > 0">
            <!-- Hidden by default - click to reveal -->
            <button 
              v-if="!showAllReflections"
              class="reflections-toggle reflections-reveal"
              @click="showAllReflections = true"
            >
              💭 Show {{ cardReflections.length }} past reflection{{ cardReflections.length > 1 ? 's' : '' }}
            </button>
            
            <!-- Revealed reflections -->
            <div class="reflections-expanded" v-if="showAllReflections">
              <div 
                v-for="(ref, idx) in cardReflections" 
                :key="idx"
                class="reflection-item"
              >
                <div class="reflection-header">
                  <span class="reflection-icon">💭</span>
                  <span class="reflection-date">{{ formatHistoryDate(ref.date) }}:</span>
                </div>
                <div class="reflection-text">"{{ ref.reflection }}"</div>
              </div>
              <button 
                class="reflections-toggle"
                @click="showAllReflections = false"
              >
                ▴ Hide reflections
              </button>
            </div>
          </div>

          <textarea 
            v-if="!isEditing"
            class="reflection-input" 
            placeholder="Add reflection..."
            v-model="reflectionText"
          ></textarea>

          <div class="interval-controls" v-if="!isEditing">
            <button 
              class="interval-btn shorter" 
              :class="{ active: selectedInterval === 'shorter' }"
              @click="selectedInterval = selectedInterval === 'shorter' ? 'default' : 'shorter'"
            >
              [{{ shorterInterval }}] Shorter
            </button>
            <span class="interval-current">{{ formatIntervalWithUnit(nextInterval, currentDeck?.intervalUnit || 'days') }}</span>
            <button 
              class="interval-btn longer"
              :class="{ active: selectedInterval === 'longer' }"
              @click="selectedInterval = selectedInterval === 'longer' ? 'default' : 'longer'"
            >
              Longer [{{ longerInterval }}]
            </button>
          </div>

          <div class="action-row">
            <template v-if="isEditing">
              <button class="btn-secondary" @click="cancelEditing">Cancel</button>
              <button class="btn-primary" @click="saveEdit">Save Edit</button>
            </template>
            <template v-else>
              <button class="btn-primary" @click="reviewCard">✓ Review Done</button>
              <div class="dropdown">
                <button class="menu-btn" @click="showMenu = !showMenu">≡</button>
                <div class="dropdown-menu" v-if="showMenu">
                  <button class="dropdown-item" @click="startEditing">Rephrase card</button>
                  <button class="dropdown-item" @click="showHistory = true; showMenu = false">View history</button>
                  <button class="dropdown-item" @click="bumpCard">Not now</button>
                  <button class="dropdown-item" @click="skipCard">Skip for today</button>
                  <button class="dropdown-item" @click="openMoveToDeck(); showMenu = false">Move to deck...</button>
                  <div class="dropdown-divider"></div>
                  <button class="dropdown-item" @click="exitReview">Exit review</button>
                  <button class="dropdown-item" @click="retireCard">Retire</button>
                  <button class="dropdown-item danger" @click="deleteCard">Delete...</button>
                </div>
              </div>
            </template>
          </div>

          <div class="queue-status" v-if="!isEditing">
            {{ dueCards.length - 1 }} more today
          </div>
          
          <!-- Score Debug Panel -->
          <div class="score-debug-panel" v-if="showScoreDebug && !isEditing">
            <div class="score-debug-header">
              📊 Score Debug
              <span class="score-debug-summary">
                Target: {{ dueCardsDebugInfo.targetCards }} | 
                Showing: {{ dueCardsDebugInfo.selectedCount }} |
                Due: {{ dueCardsDebugInfo.reviewedCount }} |
                Queue: {{ dueCardsDebugInfo.queueCount }}
              </span>
            </div>
            <div class="score-debug-current" v-if="currentCard && dueCardsDebugInfo.cardScores[currentCard.id]">
              <div class="score-debug-label">Current Card:</div>
              <div class="score-debug-row">
                <span class="score-key">Type:</span>
                <span class="score-value">{{ dueCardsDebugInfo.cardScores[currentCard.id].type }}</span>
              </div>
              <template v-if="dueCardsDebugInfo.cardScores[currentCard.id].type === 'reviewed'">
                <div class="score-debug-row">
                  <span class="score-key">Interval:</span>
                  <span class="score-value">{{ dueCardsDebugInfo.cardScores[currentCard.id].interval }} days</span>
                </div>
                <div class="score-debug-row">
                  <span class="score-key">Days overdue:</span>
                  <span class="score-value">{{ dueCardsDebugInfo.cardScores[currentCard.id].daysOverdue }}</span>
                </div>
                <div class="score-debug-row">
                  <span class="score-key">Intervals overdue:</span>
                  <span class="score-value">{{ dueCardsDebugInfo.cardScores[currentCard.id].intervalsOverdue }}</span>
                </div>
                <div class="score-debug-row">
                  <span class="score-key">Base score:</span>
                  <span class="score-value">{{ dueCardsDebugInfo.cardScores[currentCard.id].baseScore }}</span>
                </div>
                <div class="score-debug-row">
                  <span class="score-key">Period penalty:</span>
                  <span class="score-value">-{{ dueCardsDebugInfo.cardScores[currentCard.id].periodPenalty }}</span>
                </div>
                <div class="score-debug-row">
                  <span class="score-key">Over-target penalty:</span>
                  <span class="score-value">-{{ dueCardsDebugInfo.cardScores[currentCard.id].overTargetPenalty }}</span>
                </div>
                <div class="score-debug-row score-final">
                  <span class="score-key">Final score:</span>
                  <span class="score-value">{{ dueCardsDebugInfo.cardScores[currentCard.id].adjustedScore }}</span>
                </div>
              </template>
              <template v-else>
                <div class="score-debug-row">
                  <span class="score-key">Reason:</span>
                  <span class="score-value">{{ dueCardsDebugInfo.cardScores[currentCard.id].reason }}</span>
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- Deck Overview State (paused or all caught up) -->
        <div v-else class="empty-state">
          <!-- Paused review state -->
          <template v-if="pauseReview && dueCards.length > 0">
            <div class="empty-status">{{ dueCards.length }} card{{ dueCards.length === 1 ? '' : 's' }} due for review</div>
            <button class="btn-primary resume-review-btn" @click="resumeReview">Resume Review</button>
          </template>
          <!-- All caught up state -->
          <template v-else>
            <div class="empty-status">Status: All caught up ✓</div>
          </template>
          <div class="stats">
            <div class="stat-row">
              <span>Active cards</span>
              <span class="stat-value">{{ deckStats.active }}</span>
            </div>
            <div class="stat-row">
              <span>Retired</span>
              <span class="stat-value">{{ deckStats.retired }}</span>
            </div>
            <div class="stat-row">
              <span>Next due</span>
              <span class="stat-value">{{ deckStats.nextDueIn !== null ? 'in ' + deckStats.nextDueIn + ' days' : '—' }}</span>
            </div>
          </div>
          <div class="empty-deck-actions">
            <button class="btn-secondary" @click="openAllCards">Show all cards</button>
            <button class="btn-secondary" @click="showCalendar = true">📅 Calendar</button>
            <button class="btn-secondary" @click="openSettings">⚙ Settings</button>
          </div>
        </div>
      </main>

      <!-- Sign In -->
      <main class="main" v-else>
        <div class="empty-state">
          <h2 style="font-family: var(--font-display); margin-bottom: 1rem;">🔥 Fireminder</h2>
          <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">Spaced repetition with Fibonacci intervals</p>
          <button class="btn-primary" @click="signIn">Sign in with Google</button>
        </div>
      </main>

      <!-- Footer Tabs - hidden when panels are open -->
      <footer class="footer-tabs" v-if="user && decks.length > 0 && !showAddCard && !showNewDeck">
        <button 
          v-for="deck in decks.slice(0, 3)" 
          :key="deck.id"
          class="tab"
          :class="{ active: deck.id === currentDeckId }"
          @click="currentDeckId = deck.id; pauseReview = false"
        >
          {{ deck.name }}
        </button>
        <button class="tab" v-if="decks.length > 3">🌍 All</button>
      </footer>

      <!-- Add Card Panel -->
      <div class="panel" v-if="showAddCard">
        <div class="panel-header">
          <button class="icon-btn" @click="showAddCard = false">✕</button>
          <span class="panel-title">Add Card</span>
          <button class="panel-action" @click="createCard">Save</button>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label">Content</label>
            <textarea 
              class="reflection-input" 
              style="min-height: 150px;"
              placeholder="Enter card content..."
              v-model="newCardContent"
            ></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Reminder (optional, shown on first review)</label>
            <textarea 
              class="form-input" 
              style="min-height: 60px;"
              placeholder="Why am I learning this? Context for first review..."
              v-model="newCardReminder"
            ></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Deck</label>
            <select class="form-select" v-model="newCardDeckId">
              <option v-for="deck in decks" :key="deck.id" :value="deck.id">
                {{ deck.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Starting interval (optional, blank = deck default)</label>
            <input 
              type="number" 
              class="form-input"
              min="1"
              placeholder="Use deck default"
              v-model.number="newCardStartingInterval"
            />
          </div>
          <div class="form-group">
            <label class="form-label">Schedule for (optional, blank = automatic)</label>
            <input 
              type="date" 
              class="form-input"
              v-model="newCardScheduleDate"
            />
          </div>
        </div>
      </div>

      <!-- New Deck Panel -->
      <div class="panel" v-if="showNewDeck">
        <div class="panel-header">
          <button class="icon-btn" @click="showNewDeck = false">✕</button>
          <span class="panel-title">New Deck</span>
          <button class="panel-action" @click="createDeck">Create</button>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input 
              type="text" 
              class="form-input" 
              placeholder="e.g. Stoic Quotes"
              v-model="newDeckName"
            >
          </div>
          <div class="form-group">
            <label class="form-label">Starting interval</label>
            <div class="interval-input-row">
              <input 
                type="number" 
                class="form-input interval-number" 
                min="1"
                v-model.number="newDeckInterval"
              >
              <select class="form-input interval-unit-select" v-model="newDeckIntervalUnit">
                <option v-for="unit in INTERVAL_UNITS" :value="unit">{{ unit }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Target cards/day (blank = no limit)</label>
            <input 
              type="number" 
              class="form-input" 
              placeholder="No limit"
              min="1"
              v-model.number="newDeckLimit"
            >
          </div>
          <div class="form-group">
            <label class="form-label">Max new cards/day</label>
            <input 
              type="number" 
              class="form-input" 
              placeholder="1"
              min="1"
              v-model.number="newDeckMaxNewCards"
            >
          </div>
        </div>
      </div>

      <!-- History Panel -->
      <div class="panel" v-if="showHistory && currentCard">
        <div class="panel-header">
          <button class="icon-btn" @click="showHistory = false">✕</button>
          <span class="panel-title">History</span>
        </div>
        <div class="panel-body">
          <!-- Current Version -->
          <div class="history-section">
            <div class="history-label">CURRENT</div>
            <div class="history-card-content">{{ currentCard.content }}</div>
          </div>
          
          <!-- History Entries -->
          <div 
            v-for="(entry, index) in (currentCard.history || []).slice().reverse()" 
            :key="index"
            class="history-section"
          >
            <div class="history-date">{{ formatHistoryDate(entry.date) }}</div>
            <div class="history-card-content" v-if="entry.previousContent">
              {{ entry.previousContent }}
            </div>
            <div class="history-reflection" v-if="entry.reflection">
              <span class="history-reflection-label">Reflection:</span>
              {{ entry.reflection }}
            </div>
            <div class="history-interval">
              Interval: {{ formatIntervalWithUnit(entry.interval, entry.intervalUnit || currentDeck?.intervalUnit || 'days') }}
            </div>
          </div>
          
          <!-- No history yet -->
          <div v-if="!currentCard.history || currentCard.history.length === 0" class="history-empty">
            No history yet. This card hasn't been reviewed.
          </div>
        </div>
      </div>

      <!-- All Cards Panel -->
      <div class="panel" v-if="showAllCards">
        <div class="panel-header">
          <button class="icon-btn" @click="showAllCards = false">✕</button>
          <span class="panel-title">All Cards ({{ currentDeck?.name }})</span>
        </div>
        <div class="panel-body">
          <!-- Scheduled Cards (future, never reviewed) -->
          <div class="cards-section" v-if="deckStats.scheduled > 0">
            <div class="cards-section-title">SCHEDULED ({{ deckStats.scheduled }})</div>
            <div 
              v-for="card in currentDeckCards.filter(c => !c.retired && !c.deleted && !c.lastReviewDate && c.nextDueDate > effectiveToday).sort((a,b) => a.nextDueDate.localeCompare(b.nextDueDate))"
              :key="card.id"
              class="card-list-item scheduled"
              @click="showCardDetail = card; showAllCards = false"
            >
              <div class="card-list-content">{{ card.content }}</div>
              <div class="card-list-due">Starts: {{ formatDueDate(card.nextDueDate) }}</div>
            </div>
          </div>
          
          <!-- Active Cards -->
          <div class="cards-section">
            <div class="cards-section-title">ACTIVE ({{ deckStats.active - deckStats.scheduled }})</div>
            <div 
              v-for="card in currentDeckCards.filter(c => !c.retired && !c.deleted && (c.lastReviewDate || c.nextDueDate <= effectiveToday))"
              :key="card.id"
              class="card-list-item"
              @click="showCardDetail = card; showAllCards = false"
            >
              <div class="card-list-content">{{ card.content }}</div>
              <div class="card-list-due">Due: {{ formatDueDate(card.nextDueDate) }}</div>
            </div>
            <div v-if="currentDeckCards.filter(c => !c.retired && !c.deleted && (c.lastReviewDate || c.nextDueDate <= effectiveToday)).length === 0" class="empty-section">
              No active cards
            </div>
          </div>
          
          <!-- Retired Cards -->
          <div class="cards-section" v-if="currentDeckCards.filter(c => c.retired).length > 0">
            <div class="cards-section-title">RETIRED ({{ deckStats.retired }})</div>
            <div 
              v-for="card in currentDeckCards.filter(c => c.retired)"
              :key="card.id"
              class="card-list-item retired"
              @click="showCardDetail = card; showAllCards = false"
            >
              <div class="card-list-content">{{ card.content }}</div>
              <div class="card-list-due">Retired</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card Detail Panel -->
      <div class="panel" v-if="showCardDetail">
        <div class="panel-header">
          <button class="icon-btn" @click="showCardDetail = null; isEditingDetail = false">✕</button>
          <span class="panel-title">Card Detail</span>
          <button v-if="!isEditingDetail" class="panel-action" @click="startEditingDetail">Edit</button>
          <button v-else class="panel-action" @click="saveDetailEdit">Save</button>
        </div>
        <div class="panel-body">
          <!-- View mode -->
          <div v-if="!isEditingDetail" class="detail-content">{{ showCardDetail.content }}</div>
          <!-- Edit mode -->
          <div v-else class="detail-edit">
            <textarea 
              class="form-input edit-textarea" 
              v-model="detailEditContent"
              rows="6"
              placeholder="Card content..."
            ></textarea>
            <div class="edit-actions">
              <button class="btn-secondary" @click="cancelDetailEdit">Cancel</button>
            </div>
          </div>
          
          <div class="detail-meta">
            <div class="detail-row">
              <span class="detail-label">Deck:</span>
              <span>{{ currentDeck?.name }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Created:</span>
              <span>{{ formatHistoryDate(showCardDetail.createdAt) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Last reviewed:</span>
              <span>{{ showCardDetail.lastReviewDate ? formatHistoryDate(showCardDetail.lastReviewDate) : 'Never' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Current interval:</span>
              <span>{{ formatIntervalWithUnit(showCardDetail.currentInterval, currentDeck?.intervalUnit || 'days') }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Next due:</span>
              <span>{{ formatDueDate(showCardDetail.nextDueDate) }}</span>
            </div>
          </div>
          
          <div class="detail-actions">
            <button class="btn-secondary" @click="showHistory = true; showCardDetail = null">View History</button>
            <button class="btn-secondary" @click="showMoveToDeck = true">Move to Deck</button>
          </div>
          
          <div class="detail-danger">
            <button class="btn-danger-outline" @click="retireCard()">Retire</button>
            <button class="btn-danger" @click="deleteCard()">Delete</button>
          </div>
        </div>
      </div>
      
      <!-- Settings Panel -->
      <div class="panel" v-if="showSettings && currentDeck">
        <div class="panel-header">
          <button class="icon-btn" @click="showSettings = false">✕</button>
          <span class="panel-title">Settings</span>
          <button class="panel-action" @click="saveSettings">Done</button>
        </div>
        <div class="panel-body">
          <div class="settings-deck-title">DECK: {{ currentDeck.name }}</div>
          
          <div class="form-group">
            <label class="form-label">Name:</label>
            <input 
              type="text" 
              class="form-input"
              v-model="settingsName"
              placeholder="Deck name"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">Starting interval:</label>
            <div class="interval-input-row">
              <input 
                type="number" 
                class="form-input interval-number"
                v-model="settingsInterval"
                min="1"
              />
              <select class="form-input interval-unit-select" v-model="settingsIntervalUnit">
                <option v-for="unit in INTERVAL_UNITS" :value="unit">{{ unit }}</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Target cards/day:</label>
            <input 
              type="number" 
              class="form-input"
              v-model="settingsLimit"
              placeholder="No limit"
              min="1"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">Max new cards/day:</label>
            <input 
              type="number" 
              class="form-input"
              v-model="settingsMaxNewCards"
              placeholder="1"
              min="1"
            />
          </div>
          
          <div class="settings-section">
            <div class="settings-section-title">Import / Export</div>
            <div class="settings-import-export">
              <button class="btn-secondary" @click="exportDeck">📤 Export Deck</button>
              <label class="btn-secondary import-label">
                📥 Import Cards
                <input type="file" accept=".md,.txt" @change="importCards" hidden />
              </label>
            </div>
          </div>
          
          <div class="settings-danger">
            <button class="btn-danger" @click="deleteDeck">Delete Deck</button>
          </div>
        </div>
      </div>
      
      <!-- Calendar Panel -->
      <div class="panel" v-if="showCalendar">
        <div class="panel-header">
          <button class="icon-btn" @click="showCalendar = false; selectedCalendarDay = null">✕</button>
          <span class="panel-title">Calendar</span>
        </div>
        <div class="panel-body">
          <div class="calendar-nav">
            <button class="icon-btn" @click="prevMonth">◀</button>
            <span class="calendar-month-year">{{ calendarData.monthName }} {{ calendarData.year }}</span>
            <button class="icon-btn" @click="nextMonth">▶</button>
          </div>
          
          <div class="calendar-grid">
            <div class="calendar-weekday" v-for="day in ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']" :key="day">{{ day }}</div>
            <div 
              v-for="n in calendarData.startDayOfWeek" 
              :key="'empty-' + n"
              class="calendar-day empty"
            ></div>
            <div 
              v-for="day in calendarData.days" 
              :key="day.date"
              class="calendar-day"
              :class="{ 
                today: day.isToday, 
                past: day.isPast, 
                future: day.isFuture,
                'has-reviews': day.reviewedCount > 0,
                'has-due': day.dueCount > 0,
                'selected': selectedCalendarDay?.date === day.date,
                'clickable': day.reviewedCount > 0 || day.dueCount > 0
              }"
              @click="(day.reviewedCount > 0 || day.dueCount > 0) && selectCalendarDay(day)"
            >
              <span class="calendar-day-num">{{ day.day }}</span>
              <span class="calendar-day-count" v-if="day.reviewedCount > 0 && day.isPast">✓{{ day.reviewedCount }}</span>
              <span class="calendar-day-count" v-if="day.dueCount > 0 && !day.isPast">{{ day.dueCount }}</span>
            </div>
          </div>
          
          <div class="calendar-legend">
            <span class="legend-item"><span class="legend-dot reviewed"></span> Reviewed</span>
            <span class="legend-item"><span class="legend-dot due"></span> Due</span>
          </div>
          
          <!-- Cards for selected day -->
          <div class="calendar-day-cards" v-if="selectedCalendarDay">
            <div class="calendar-day-cards-header">
              <span class="calendar-day-cards-title">
                {{ selectedCalendarDay.isPast ? 'Reviewed on' : 'Due on' }} 
                {{ formatHistoryDate(selectedCalendarDay.date) }}
              </span>
              <button class="icon-btn" @click="selectedCalendarDay = null">✕</button>
            </div>
            <div class="calendar-day-cards-list" v-if="cardsForSelectedDay.length > 0">
              <div 
                v-for="card in cardsForSelectedDay" 
                :key="card.id"
                class="calendar-card-item"
                @click="openCardFromCalendar(card)"
              >
                <div class="calendar-card-content">{{ card.content }}</div>
                <div class="calendar-card-meta" v-if="selectedCalendarDay.isPast && card.historyEntry">
                  <span v-if="card.historyEntry.reflection" class="calendar-card-reflection">
                    💭 "{{ card.historyEntry.reflection }}"
                  </span>
                  <span class="calendar-card-interval">
                    Interval: {{ formatIntervalWithUnit(card.historyEntry.interval, card.historyEntry.intervalUnit || currentDeck?.intervalUnit || 'days') }}
                  </span>
                </div>
                <div class="calendar-card-meta" v-else>
                  <span class="calendar-card-interval">
                    Current interval: {{ formatIntervalWithUnit(card.currentInterval, currentDeck?.intervalUnit || 'days') }}
                  </span>
                </div>
              </div>
            </div>
            <div class="calendar-day-cards-empty" v-else>
              No cards for this day
            </div>
          </div>
        </div>
      </div>
      
      <!-- Content Page Panel -->
      <div class="panel content-panel" v-if="showContentPage">
        <div class="panel-header">
          <button class="icon-btn" @click="goBackContent()">
            {{ contentPageSlug ? '←' : '✕' }}
          </button>
          <span class="panel-title">{{ contentPageData?.title || 'Help & Docs' }}</span>
        </div>
        <div class="panel-body">
          <!-- Loading state -->
          <div v-if="contentPageLoading" class="content-loading">Loading...</div>
          
          <!-- Content Index -->
          <div v-else-if="!contentPageData" class="content-index">
            <div class="content-search">
              <input 
                type="text" 
                class="form-input"
                placeholder="Search docs..."
                v-model="contentSearchQuery"
              />
            </div>
            
            <div class="content-list">
              <div 
                v-for="[slug, data] in filteredContentIndex" 
                :key="slug"
                class="content-item"
                @click="loadContentPage(slug)"
              >
                <div class="content-item-title">{{ data.title }}</div>
                <div class="content-item-desc">{{ data.description }}</div>
              </div>
            </div>
            
            <div class="content-actions">
              <button class="btn-secondary" @click="showSuggestionBox = true">
                💡 Suggest a topic
              </button>
            </div>
          </div>
          
          <!-- Content Page -->
          <div v-else class="content-body">
            <div class="content-html" v-html="contentPageData.content" @click="handleContentClick"></div>
          </div>
          
          <!-- Suggestion Box Modal -->
          <div class="suggestion-overlay" v-if="showSuggestionBox" @click.self="showSuggestionBox = false">
            <div class="suggestion-box">
              <div class="suggestion-header">Suggest a Topic</div>
              <textarea 
                class="form-input"
                rows="4"
                placeholder="What would you like to learn about?"
                v-model="suggestionText"
              ></textarea>
              <div class="suggestion-actions">
                <button class="btn-secondary" @click="showSuggestionBox = false">Cancel</button>
                <button class="btn-primary" @click="submitSuggestion">Submit</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Move to Deck Modal -->
      <div class="modal-overlay" v-if="showMoveToDeck" @click.self="showMoveToDeck = false">
        <div class="modal">
          <div class="modal-header">Move Card</div>
          <div class="modal-body">
            <div class="modal-label">Move to:</div>
            <div class="deck-options">
              <label 
                v-for="deck in decks" 
                :key="deck.id"
                class="deck-option"
                :class="{ current: deck.id === (showCardDetail?.deckId || currentCard?.deckId) }"
              >
                <input 
                  type="radio" 
                  name="moveToDeck" 
                  :value="deck.id"
                  v-model="moveToDeckTarget"
                  :disabled="deck.id === (showCardDetail?.deckId || currentCard?.deckId)"
                />
                <span>{{ deck.name }}</span>
                <span class="current-badge" v-if="deck.id === (showCardDetail?.deckId || currentCard?.deckId)">(current)</span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="showMoveToDeck = false">Cancel</button>
            <button class="btn-primary" @click="moveCard" :disabled="!moveToDeckTarget">Move</button>
          </div>
        </div>
      </div>
      
      <!-- Time Travel Reset Confirmation Modal -->
      <div class="modal-overlay" v-if="showResetConfirm" @click.self="showResetConfirm = false">
        <div class="modal">
          <div class="modal-header">Return to Today</div>
          <div class="modal-body">
            <p style="margin-bottom: 1rem;">You've been time traveling. What would you like to do with any cards or decks created during this session?</p>
          </div>
          <div class="modal-footer" style="flex-direction: column; gap: 0.5rem;">
            <button class="btn-primary" @click="clearSimulatedDate(); showResetConfirm = false" style="width: 100%;">
              Keep Changes
            </button>
            <button class="btn-danger" @click="resetTimeTravelAndDiscard" style="width: 100%;">
              Discard Changes
            </button>
            <button class="btn-secondary" @click="showResetConfirm = false" style="width: 100%;">
              Cancel
            </button>
          </div>
        </div>
      </div>
      
      <!-- Analytics Admin Panel -->
      <div class="panel analytics-panel" v-if="showAnalyticsAdmin" data-testid="analytics-admin">
        <div class="panel-header">
          <button class="icon-btn" @click="closeAnalyticsAdmin">✕</button>
          <span class="panel-title">Landing Page Analytics</span>
          <button class="panel-action" @click="loadAnalytics">Refresh</button>
        </div>
        <div class="panel-body">
          <div v-if="analyticsLoading" class="analytics-loading">
            Loading analytics data...
          </div>
          <template v-else>
            <!-- Summary Cards -->
            <div class="analytics-summary">
              <div class="analytics-stat">
                <div class="analytics-stat-value">{{ analyticsSummary.totalPageViews || 0 }}</div>
                <div class="analytics-stat-label">Page Views</div>
              </div>
              <div class="analytics-stat">
                <div class="analytics-stat-value">{{ analyticsSummary.uniqueVisitorCount || 0 }}</div>
                <div class="analytics-stat-label">Unique Visitors</div>
              </div>
              <div class="analytics-stat">
                <div class="analytics-stat-value">{{ analyticsSummary.signups || 0 }}</div>
                <div class="analytics-stat-label">Signups</div>
              </div>
            </div>
            
            <!-- By Landing Page -->
            <div class="analytics-section" v-if="Object.keys(analyticsSummary.byPage || {}).length > 0">
              <h3>By Landing Page</h3>
              <table class="analytics-table">
                <thead>
                  <tr><th>Page</th><th>Views</th><th>Signups</th><th>Conv %</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(data, page) in analyticsSummary.byPage" :key="page">
                    <td>{{ page }}</td>
                    <td>{{ data.views }}</td>
                    <td>{{ data.signups }}</td>
                    <td>{{ data.views > 0 ? ((data.signups / data.views) * 100).toFixed(1) : 0 }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <!-- By Campaign -->
            <div class="analytics-section" v-if="Object.keys(analyticsSummary.byCampaign || {}).length > 0">
              <h3>By Campaign</h3>
              <table class="analytics-table">
                <thead>
                  <tr><th>Campaign</th><th>Views</th><th>Signups</th><th>Conv %</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(data, campaign) in analyticsSummary.byCampaign" :key="campaign">
                    <td>{{ campaign }}</td>
                    <td>{{ data.views }}</td>
                    <td>{{ data.signups }}</td>
                    <td>{{ data.views > 0 ? ((data.signups / data.views) * 100).toFixed(1) : 0 }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <!-- Recent Events -->
            <div class="analytics-section">
              <h3>Recent Events ({{ analyticsData.length }})</h3>
              <div class="analytics-events">
                <div class="analytics-event" v-for="event in analyticsData.slice(0, 50)" :key="event.id">
                  <span class="event-type" :class="event.event">{{ event.event }}</span>
                  <span class="event-page">{{ event.page }}</span>
                  <span class="event-campaign" v-if="event.campaign">{{ event.campaign }}</span>
                  <span class="event-time">{{ new Date(event.timestamp).toLocaleString() }}</span>
                </div>
              </div>
            </div>
            
            <div v-if="analyticsData.length === 0" class="analytics-empty">
              No analytics data yet. Visit a landing page to generate events.
            </div>
          </template>
        </div>
      </div>
      
      <!-- Skip Toast -->
      <div class="skip-toast" v-if="showSkipToast">
        <span>Skipped. Will show again later today.</span>
        <button class="toast-undo" @click="undoSkip">Undo</button>
      </div>
      
      <!-- Bump Toast (Not now) -->
      <div class="bump-toast" v-if="showBumpToast">
        <span>Moved to end of queue.</span>
        <button class="toast-undo" @click="undoBump">Undo</button>
      </div>
    </div>
  `
}).mount('#app');

