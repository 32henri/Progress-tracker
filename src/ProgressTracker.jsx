import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Check,
  Trash2,
  Flame,
  Target,
  ListTodo,
  TrendingUp,
  TrendingDown,
  X,
  Minus,
  Sparkles,
  Dumbbell,
  BookOpen,
  Award,
  Hexagon,
  Shield,
  Star,
  Zap,
  Gem,
  Crown,
  Swords,
  Trophy,
  Camera,
  Pencil,
  ChevronDown,
  ChevronLeft,
  Settings,
  LogOut,
  Skull,
  Clock,
  Folder,
} from "lucide-react";
import { load, save } from "./lib/storage";
import { setAIStatus, getAIStatus, subscribeAIStatus } from "./lib/aiStatus";

// ---------- constants & pure helpers ----------

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MAIN_STAT_NAMES = ["Intelligence", "Strength", "Stamina", "Agility", "Vitality", "Discipline", "Charisma", "Wealth"];
const mainStatId = (name) => `main-${name.toLowerCase()}`;
const STAT_ID_TO_NAME = Object.fromEntries(MAIN_STAT_NAMES.map((n) => [mainStatId(n), n]));

// "Use it or lose it" — each stat has its own real-world rust profile: how many idle
// days before decay starts, what % of the current level's XP threshold it loses per
// day past that, and a floor (as a % of the highest level ever reached) decay can never
// push it below — muscle memory / retained knowledge, not a reset to zero. Physical,
// perishable stats (Discipline, Stamina) rust fast and shallow-floor; sticky ones
// (Intelligence, Wealth) rust slow and barely at all.
const STAT_DECAY_PROFILE = {
  Discipline: { graceDays: 1, dailyRate: 0.04, floorPct: 0.3 },
  Stamina: { graceDays: 5, dailyRate: 0.04, floorPct: 0.4 },
  Agility: { graceDays: 7, dailyRate: 0.03, floorPct: 0.5 },
  Vitality: { graceDays: 7, dailyRate: 0.025, floorPct: 0.55 },
  Strength: { graceDays: 10, dailyRate: 0.02, floorPct: 0.6 },
  Charisma: { graceDays: 10, dailyRate: 0.015, floorPct: 0.65 },
  Intelligence: { graceDays: 14, dailyRate: 0.01, floorPct: 0.75 },
  Wealth: { graceDays: 30, dailyRate: 0.005, floorPct: 0.85 },
};

// Curated starter skills with fixed, hand-tuned stat splits — deterministic
// (no AI/heuristic) so every user gets the identical breakdown for a given
// skill name. See PROGRESS-TRACKER notes for the reasoning behind splits.
const PRESET_SKILLS = [
  { name: "Programming", stats: [["Intelligence", 80], ["Discipline", 20]] },
  { name: "Reading", stats: [["Intelligence", 70], ["Discipline", 30]] },
  { name: "Writing", stats: [["Intelligence", 55], ["Charisma", 25], ["Discipline", 20]] },
  { name: "Chess", stats: [["Intelligence", 85], ["Discipline", 15]] },
  { name: "Language Learning", stats: [["Intelligence", 65], ["Discipline", 35]] },
  { name: "Public Speaking", stats: [["Charisma", 70], ["Discipline", 30]] },
  { name: "Networking", stats: [["Charisma", 80], ["Discipline", 20]] },
  { name: "Sales", stats: [["Charisma", 55], ["Wealth", 25], ["Discipline", 20]] },
  { name: "Investing", stats: [["Wealth", 70], ["Intelligence", 30]] },
  { name: "Budgeting", stats: [["Wealth", 60], ["Discipline", 40]] },
  { name: "Entrepreneurship", stats: [["Wealth", 40], ["Charisma", 30], ["Discipline", 30]] },
  { name: "Weightlifting", stats: [["Strength", 80], ["Vitality", 20]] },
  { name: "Powerlifting", stats: [["Strength", 90], ["Discipline", 10]] },
  { name: "Calisthenics", stats: [["Strength", 55], ["Agility", 30], ["Stamina", 15]] },
  { name: "Running", stats: [["Stamina", 70], ["Vitality", 30]] },
  { name: "Cycling", stats: [["Stamina", 55], ["Vitality", 25], ["Strength", 20]] },
  { name: "Swimming", stats: [["Stamina", 45], ["Strength", 30], ["Vitality", 25]] },
  { name: "Hiking", stats: [["Stamina", 50], ["Vitality", 30], ["Discipline", 20]] },
  { name: "Basketball", stats: [["Agility", 50], ["Stamina", 30], ["Strength", 20]] },
  { name: "Soccer", stats: [["Agility", 45], ["Stamina", 40], ["Strength", 15]] },
  { name: "Tennis", stats: [["Agility", 60], ["Stamina", 30], ["Strength", 10]] },
  { name: "Boxing / Martial Arts", stats: [["Strength", 40], ["Agility", 40], ["Discipline", 20]] },
  { name: "Dancing", stats: [["Agility", 55], ["Charisma", 25], ["Stamina", 20]] },
  { name: "Rock Climbing", stats: [["Strength", 50], ["Agility", 35], ["Stamina", 15]] },
  { name: "Yoga", stats: [["Vitality", 40], ["Agility", 35], ["Discipline", 25]] },
  { name: "Stretching / Mobility", stats: [["Agility", 50], ["Vitality", 50]] },
  { name: "Cooking", stats: [["Vitality", 45], ["Discipline", 30], ["Intelligence", 25]] },
  { name: "Nutrition", stats: [["Vitality", 70], ["Discipline", 30]] },
  { name: "Sleep Optimization", stats: [["Vitality", 75], ["Discipline", 25]] },
  { name: "Morning Routine", stats: [["Discipline", 75], ["Vitality", 25]] },
];

// Common vices for quick-add — same spirit as PRESET_SKILLS but for VicesView's
// one-tap "quick add" row. `xp` is a starting suggestion for xpPerLog (the debuff
// magnitude), not a calibrated value — user can edit it after adding, same as any
// AI-suggested or manually-entered vice. Deliberately skews toward Discipline/
// Vitality/Wealth/Charisma since that's realistically what most common vices hit;
// Strength/Agility/Intelligence are rarely directly hurt by a single bad habit.
const PRESET_VICES = [
  { name: "Fast food / junk food", stats: [["Vitality", 100]], xp: 80 },
  { name: "Overeating / binge eating", stats: [["Vitality", 100]], xp: 100 },
  { name: "Sugar binge", stats: [["Vitality", 100]], xp: 70 },
  { name: "Skipped meals / erratic eating", stats: [["Vitality", 100]], xp: 70 },
  { name: "Drank alcohol", stats: [["Discipline", 40], ["Vitality", 35], ["Stamina", 25]], xp: 130 },
  { name: "Binge drinking", stats: [["Discipline", 50], ["Vitality", 50]], xp: 300 },
  { name: "Smoking / vaping", stats: [["Vitality", 65], ["Stamina", 35]], xp: 150 },
  { name: "Recreational drug use", stats: [["Vitality", 60], ["Discipline", 40]], xp: 250 },
  { name: "Slept in / overslept", stats: [["Discipline", 100]], xp: 70 },
  { name: "Stayed up too late", stats: [["Discipline", 55], ["Vitality", 45]], xp: 80 },
  { name: "Skipped workout", stats: [["Discipline", 60], ["Stamina", 40]], xp: 90 },
  { name: "Skipped planned routine/habit", stats: [["Discipline", 100]], xp: 80 },
  { name: "Procrastinated an important task", stats: [["Discipline", 100]], xp: 110 },
  { name: "Missed a deadline / commitment", stats: [["Discipline", 100]], xp: 150 },
  { name: "Excessive social media scrolling", stats: [["Discipline", 65], ["Intelligence", 35]], xp: 80 },
  { name: "Binge-watched TV/YouTube", stats: [["Discipline", 100]], xp: 80 },
  { name: "Unplanned video game binge", stats: [["Discipline", 100]], xp: 90 },
  { name: "Doomscrolling / news binge", stats: [["Discipline", 60], ["Intelligence", 40]], xp: 60 },
  { name: "Excessive caffeine", stats: [["Vitality", 60], ["Discipline", 40]], xp: 50 },
  { name: "Impulse purchase", stats: [["Wealth", 100]], xp: 120 },
  { name: "Overspent / blew the budget", stats: [["Wealth", 100]], xp: 150 },
  { name: "Gambling", stats: [["Wealth", 70], ["Discipline", 30]], xp: 250 },
  { name: "Pornography overuse", stats: [["Discipline", 70], ["Charisma", 30]], xp: 120 },
  { name: "Skipped hygiene / grooming", stats: [["Vitality", 55], ["Charisma", 45]], xp: 60 },
  { name: "Lost temper / road rage", stats: [["Discipline", 55], ["Charisma", 45]], xp: 100 },
  { name: "Gossiping / bad-mouthing someone", stats: [["Charisma", 100]], xp: 80 },
  { name: "Lying", stats: [["Charisma", 65], ["Discipline", 35]], xp: 140 },
  { name: "Isolating / skipped socializing", stats: [["Charisma", 100]], xp: 70 },
  { name: "Negative self-talk spiral", stats: [["Discipline", 50], ["Charisma", 50]], xp: 70 },
  { name: "Nail-biting / nervous tic", stats: [["Discipline", 100]], xp: 40 },
];

// Skill starting level comes from two structured questions (duration +
// current frequency), same spirit as the main-stat questionnaire — not a
// single self-declared number.
const SKILL_DURATION_OPTIONS = [
  { label: "Never tried it", points: 0 },
  { label: "Just started (<6 months)", points: 1 },
  { label: "6 months – 2 years", points: 2 },
  { label: "2 – 5 years", points: 3 },
  { label: "5+ years", points: 4 },
];
const SKILL_FREQUENCY_OPTIONS = [
  { label: "Not currently active", points: 0 },
  { label: "A few times a month", points: 1 },
  { label: "Weekly", points: 2 },
  { label: "Several times a week", points: 3 },
  { label: "Daily / professionally", points: 4 },
];
// score 0..8 -> level, anchored to the same scale used for main stats
// (5 = below average, 10 = average, 20 = recreational, 35 = competitive, 50+ = elite)
const SKILL_LEVEL_BY_SCORE = [2, 5, 8, 11, 15, 19, 24, 31, 40];
function computeSkillLevel(durationIdx, frequencyIdx) {
  if (durationIdx === 0) return SKILL_LEVEL_BY_SCORE[0]; // never tried it overrides frequency entirely
  const score = Math.min(8, SKILL_DURATION_OPTIONS[durationIdx].points + SKILL_FREQUENCY_OPTIONS[frequencyIdx].points);
  return SKILL_LEVEL_BY_SCORE[score];
}

// ---------- onboarding: self-reported benchmarks -> starting stat level ----------
// Every "choice" question uses the same 5-point scale, index-matched to TIER_POINTS, so
// picking the middle option always scores exactly 10 — calibrating the whole system so a
// genuinely average, untrained adult starts at Level 10 across the board. "numeric"
// questions score the same 0/5/10/20/35 scale but interpolated continuously between
// breakpoints instead of snapped to 5 buckets, for anything better captured as a number
// (reps, weight, income, a test score) than a vague self-rating. Numeric answers are
// always optional — leaving one blank just excludes it from that stat's average.
const TIER_POINTS = [0, 5, 10, 20, 35];
function interpolatePoints(breakpoints, x, decel = "sqrt") {
  if (!Number.isFinite(x)) return null;
  if (x <= breakpoints[0][0]) return breakpoints[0][1];
  for (let i = 1; i < breakpoints.length; i++) {
    const [x0, y0] = breakpoints[i - 1];
    const [x1, y1] = breakpoints[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  // Past the last breakpoint: don't flatline. Extrapolate using the slope of the
  // final segment, but decelerate so it keeps climbing for measurable stats (income,
  // 1RM, reps) without blowing up linearly forever. One full segment-width past the
  // last point still lands exactly on one more segment's worth of points (continuous
  // at the boundary); every segment-width beyond that gives diminishing returns.
  // Default deceleration is sqrt. "log" is steeper still — for a stat like Wealth,
  // where someone can plausibly type an absurdly large number (income, net worth),
  // sqrt still eventually produces silly levels (tens of thousands) at extreme inputs;
  // log keeps even a wildly large number landing somewhere sane.
  const [xPrev, yPrev] = breakpoints[breakpoints.length - 2];
  const [xLast, yLast] = breakpoints[breakpoints.length - 1];
  const segmentWidth = xLast - xPrev;
  const segmentGain = yLast - yPrev;
  if (segmentWidth <= 0) return yLast;
  const units = (x - xLast) / segmentWidth;
  const factor = decel === "log" ? Math.log2(1 + units) : Math.sqrt(units);
  return yLast + segmentGain * factor;
}

const STAT_BENCHMARKS = {
  Intelligence: [
    { prompt: "Formal education", options: ["Didn't complete secondary school", "Completed secondary school", "Some university / vocational training", "Bachelor's degree", "Master's degree or higher"] },
    { prompt: "Deliberate learning (reading, courses, new skills)", options: ["Rarely engage with any of this", "Occasionally, when I have to", "Read or learn something new most weeks", "Consistently study/read, multiple times a week", "Deep expertise built through years of deliberate study"] },
    { prompt: "Problem-solving in complex or technical situations", options: ["Struggle with multi-step problems", "Can follow along but rarely lead", "Solve most problems given enough time", "Quick, reliable analytical thinker", "Exceptional — regularly solve problems others can't"] },
    { type: "numeric", prompt: "IQ score, if you know it (optional)", unit: "", placeholder: "e.g. 100", breakpoints: [[70, 0], [90, 5], [100, 10], [120, 20], [140, 35]] },
  ],
  Stamina: [
    { prompt: "5km run — best time, or honest estimate", options: ["Can't run 1km without stopping", "30–40 min", "25–30 min", "20–25 min", "Under 20 min"] },
    { prompt: "Cardio frequency", options: ["None", "Rarely, a few times a month", "1–2×/week", "3–4×/week", "Daily / competitive endurance training"] },
  ],
  Agility: [
    { prompt: "Sports / coordination background", options: ["Never played sports", "Played casually as a kid", "Play recreationally now and then", "Regular in a sport, martial art, or dance", "Competitive athlete in a coordination-heavy sport"] },
    { prompt: "Balance & flexibility", options: ["Can't touch toes, poor balance", "Below-average flexibility/balance", "Normal — can touch toes, steady balance", "Good mobility, some training (yoga, martial arts)", "Excellent, extensively trained"] },
  ],
  Vitality: [
    { prompt: "General health, sleep, energy", options: ["Frequently sick, poor sleep, low energy", "Below-average energy or health", "Generally healthy, average energy", "Rarely sick, good sleep habits, high energy", "Excellent health markers, athlete-level recovery"] },
    { prompt: "Diet quality", options: ["Mostly junk / fast food", "Inconsistent, some healthy meals", "Balanced diet most days", "Consistently healthy, tracks nutrition", "Optimized diet, meal-planned, nutrition-focused"] },
  ],
  Discipline: [
    { prompt: "Sticking to routines or habits", options: ["Struggle to keep any routine going", "Inconsistent, start-stop", "Keep a few habits going reliably", "Solid daily routine, rarely miss", "Extremely consistent — streaks of months or years"] },
    { type: "numeric", prompt: "Longest streak you've ever kept an intentional daily habit going", unit: "days", placeholder: "e.g. 30", breakpoints: [[0, 0], [7, 5], [30, 10], [90, 20], [365, 35]] },
  ],
  Charisma: [
    { prompt: "Social comfort / communication", options: ["Very anxious in social situations", "Somewhat shy or reserved", "Comfortable in normal social settings", "Confident — good at networking or speaking", "Highly persuasive, public speaking/leadership experience"] },
    { prompt: "Social circle & influence", options: ["Few to no close friends", "Small close circle", "Normal friend group", "Wide network, often organizes socially", "Large network, recognized influence or leadership role"] },
  ],
  Wealth: [
    { type: "numeric", prompt: "Approximate net monthly income", unit: "€/mo", placeholder: "e.g. 1500", decel: "log", breakpoints: [[0, 0], [500, 5], [1500, 10], [3000, 20], [6000, 35]] },
    { prompt: "Financial literacy & management", options: ["No budget, no savings", "Rough idea of spending, little saved", "Track spending, save something regularly", "Budget deliberately, save/invest regularly", "Actively invest, multiple income streams"] },
  ],
};

// Strength gets its own input shape instead of the generic question list: real
// exercises with reps/weight, scored on the same 0/5/10/20/35 scale via interpolation.
// Squat/deadlift score relative to bodyweight (a far better strength signal than an
// absolute number); push-ups/pull-ups score on raw reps. Every field is optional —
// whichever ones are filled in get averaged, blank ones are just excluded.
const STRENGTH_EXERCISES = [
  { id: "pushups", label: "Push-ups, max reps in one set", kind: "reps", unit: "reps", breakpoints: [[0, 0], [5, 5], [15, 10], [30, 20], [50, 35]] },
  { id: "pullups", label: "Pull-ups, max strict reps", kind: "reps", unit: "reps", breakpoints: [[0, 0], [1, 6], [7, 10], [15, 20], [30, 35]] },
  { id: "squat", label: "Squat", kind: "lift", breakpoints: [[0, 0], [0.5, 5], [1.0, 10], [1.5, 20], [2.0, 35]] },
  { id: "deadlift", label: "Deadlift", kind: "lift", breakpoints: [[0, 0], [0.75, 5], [1.25, 10], [1.75, 20], [2.5, 35]] },
];
function estimate1RM(weight, reps) {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (!Number.isFinite(reps) || reps <= 1) return weight;
  return weight * (1 + reps / 30);
}


// Level curves: base is the level-1→2 requirement, growth scales super-linearly
// (level-1)^1.3 so early levels come quick and later levels demand more —
// a real curve instead of a flat per-level increment.
const xpThreshold = (level) => 5000 + Math.round(417 * Math.pow(level - 1, 1.3)); // Stats — first level-up now matches the 300xp/day-cap-tuned 5000xp baseline
const skillXpThreshold = (level) => 5000 + Math.round(900 * Math.pow(level - 1, 1.3)); // Skills — first level-up matches the 300xp/day cap: ~17 days minimum
const SKILL_DAILY_CAP = 300; // anti-farm: max xp a single skill can gain per day

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysBetween = (fromStr, toStr) => Math.round((new Date(toStr + "T00:00:00") - new Date(fromStr + "T00:00:00")) / 86400000);
const weekdayOf = (dateStr) => new Date(dateStr + "T00:00:00").getDay();
const dayLabel = (d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
const last7 = () => {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};
const weekDatesOf = (dateStr) => {
  const ref = new Date(dateStr + "T00:00:00");
  const monOffset = (ref.getDay() + 6) % 7;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - monOffset);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};
const currentWeekDates = () => weekDatesOf(new Date().toISOString().slice(0, 10));
const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_WORKOUT_CATEGORIES = ["Pull Day", "Push Day", "Leg Day", "Arm Day", "Back Day", "Chest Day"];

// Calls the AI for skill/habit/stat classification. Tries, in order:
// 1) the free Claude.ai-artifact proxy (no key needed, only works inside Claude.ai)
// 2) Google Gemini's free tier (real recurring free quota, no card required —
//    the practical "free AI" option once this is a standalone app)
// 3) the user's own Anthropic key, if they've entered one (paid, optional upgrade)
// Throws if none work; callers fall back to a local heuristic.
async function callClaudeAI(prompt, maxTokens, keys = {}) {
  const { apiKey, geminiKey } = typeof keys === "string" ? { apiKey: keys } : keys;
  const failures = [];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (r.ok) {
      const data = await r.json();
      const text = (data.content || []).map((c) => c.text || "").join("");
      if (text) {
        setAIStatus("Claude (Claude.ai proxy)");
        return text;
      }
      failures.push("Claude proxy: empty response");
    } else {
      failures.push(`Claude proxy: HTTP ${r.status}`);
    }
  } catch (e) {
    // Expected once standalone — the free Claude.ai proxy only exists inside claude.ai.
    failures.push(`Claude proxy: unavailable (${e.message})`);
  }

  if (geminiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            // Force raw JSON out so no reasoning/preamble text can break the
            // downstream JSON.parse.
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      if (r.ok) {
        const data = await r.json();
        const candidate = (data.candidates || [])[0];
        const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
        if (text) {
          setAIStatus("Gemini");
          return text;
        }
        failures.push(`Gemini: empty response (finishReason: ${candidate?.finishReason || "unknown"})`);
      } else {
        const body = await r.text().catch(() => "");
        failures.push(`Gemini: HTTP ${r.status} ${body.slice(0, 120)}`);
      }
    } catch (e) {
      failures.push(`Gemini: ${e.message}`);
    }
  }

  if (apiKey) {
    try {
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
      });
      if (r2.ok) {
        const data2 = await r2.json();
        const text2 = (data2.content || []).map((c) => c.text || "").join("");
        if (text2) {
          setAIStatus("Anthropic API key");
          return text2;
        }
        failures.push("Anthropic key: empty response");
      } else {
        failures.push(`Anthropic key: HTTP ${r2.status}`);
      }
    } catch (e) {
      failures.push(`Anthropic key: ${e.message}`);
    }
  }

  throw new Error(failures.join(" | ") || "No AI classification path available (no keys set)");
}

// Extracts the first balanced {...} block from arbitrary text — a safety
// net for when a provider wraps JSON in code fences or stray commentary
// despite being asked for raw JSON.
function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return JSON.parse(clean); // let it throw with a useful message
  return JSON.parse(clean.slice(start, end + 1));
}

// Local, no-network fallback classifier. Used when the AI call fails or isn't
// available (e.g. running standalone outside Claude.ai, where the proxied
// fetch to api.anthropic.com no longer works). Scores skills by word overlap
// against the task/habit text and splits weight across the matches found.
function heuristicClassify(skills, text) {
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => (w.endsWith("s") ? w.slice(0, -1) : w)); // crude stemming

  const textWords = new Set(norm(text));
  if (textWords.size === 0) return [];

  const scored = skills
    .map((s) => {
      const skillWords = norm(s.name);
      const hits = skillWords.filter((w) => textWords.has(w) || [...textWords].some((tw) => tw.includes(w) || w.includes(tw))).length;
      return { id: s.id, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (scored.length === 0) return [];

  const top = scored.slice(0, 2);
  const totalHits = top.reduce((a, s) => a + s.hits, 0);
  return top.map((s, i) => ({
    skillId: s.id,
    weight: i === top.length - 1 ? 100 - Math.round((100 * (totalHits - s.hits)) / totalHits) : Math.round((100 * s.hits) / totalHits),
  }));
}

// Keyword dictionary for skill -> stat affinity fallback. Word-overlap doesn't work here
// (a skill named "Programming" shares no words with a stat named "Intelligence"), so this
// maps common skill-domain keywords to the 8 fixed stats instead. Used when AI is unavailable.
const STAT_KEYWORDS = {
  Intelligence: ["programming", "coding", "code", "study", "studying", "math", "chess", "read", "reading", "writing", "research", "learn", "learning", "language", "science", "puzzle"],
  Strength: ["lifting", "weight", "weights", "gym", "strength", "powerlifting", "bench", "squat", "deadlift"],
  Stamina: ["running", "run", "cardio", "cycling", "bike", "swim", "swimming", "endurance", "jog", "jogging", "hiit"],
  Agility: ["sport", "sports", "dance", "dancing", "martial", "boxing", "climbing", "yoga", "mobility", "basketball", "football", "soccer", "tennis"],
  Vitality: ["sleep", "health", "nutrition", "diet", "cooking", "meditation", "stretching", "recovery"],
  Discipline: ["habit", "routine", "consistency", "discipline", "journal", "journaling", "planning", "waking", "morning"],
  Charisma: ["social", "networking", "speaking", "charisma", "communication", "sales", "presenting", "public"],
  Wealth: ["finance", "investing", "invest", "budget", "budgeting", "business", "money", "trading", "saving", "entrepreneur"],
};
function heuristicStatAffinity(stats, skillName) {
  const words = (skillName || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];

  const scored = stats
    .map((s) => {
      const keywords = STAT_KEYWORDS[s.name] || [];
      const hits = words.filter((w) => keywords.some((k) => k.includes(w) || w.includes(k))).length;
      return { id: s.id, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (!scored.length) return [];
  const top = scored.slice(0, 2);
  const totalHits = top.reduce((a, s) => a + s.hits, 0);
  return top.map((s, i) => ({
    statId: s.id,
    weight: i === top.length - 1 ? 100 - Math.round((100 * (totalHits - s.hits)) / totalHits) : Math.round((100 * s.hits) / totalHits),
  }));
}

// load/save now come from ./lib/storage — Firestore-backed, same signature.

function ensureMainStats(stats) {
  const existingIds = new Set(stats.map((s) => s.id));
  const missing = MAIN_STAT_NAMES.filter((n) => !existingIds.has(mainStatId(n))).map((n) => ({
    id: mainStatId(n),
    name: n,
    level: 1,
    xp: 0,
    isMain: true,
  }));
  return missing.length ? [...stats, ...missing] : stats;
}

// One-time backfill for skills saved before decay existed: seed lastActiveDate to today
// (not the past) so nobody gets retroactively decayed for time before this feature
// shipped, and peakLevel to their current level.
function ensureDecayFields(skills) {
  const today = todayStr();
  let changed = false;
  const next = skills.map((s) => {
    if (s.lastActiveDate && s.peakLevel != null) return s;
    changed = true;
    return { ...s, lastActiveDate: s.lastActiveDate || today, peakLevel: Math.max(s.peakLevel || 0, s.level) };
  });
  return { skills: next, changed };
}

// A skill's decay profile is the weighted blend of its linked stats' profiles (via the
// same statAffinities weights XP gains use) — a skill split across a fast-rusting stat
// and a sticky one decays somewhere in between. A skill with no recognized stat
// affinities doesn't decay at all.
function skillDecayProfile(skill) {
  const affinities = skill.statAffinities || [];
  let graceDays = 0, dailyRate = 0, floorPct = 0, weightTotal = 0;
  affinities.forEach((a) => {
    const profile = STAT_DECAY_PROFILE[STAT_ID_TO_NAME[a.statId]];
    if (!profile) return;
    graceDays += profile.graceDays * a.weight;
    dailyRate += profile.dailyRate * a.weight;
    floorPct += profile.floorPct * a.weight;
    weightTotal += a.weight;
  });
  if (weightTotal === 0) return null;
  return { graceDays: graceDays / weightTotal, dailyRate: dailyRate / weightTotal, floorPct: floorPct / weightTotal };
}

// Computes how much XP a single skill has rusted off since it was last trained, walking
// day-by-day (using the skill's own level-scaled daily threshold, same curve leveling up
// uses) so the loss compounds correctly across a long gap, and stopping exactly at the
// peak-relative floor rather than overshooting past it. Returns the raw XP amount lost —
// treated the same way a positive `finalXp` is in grantSkillXp, both for updating the
// skill itself and for fanning out to stats via the same affinity weights.
function computeSkillDecay(skill, today) {
  const profile = skillDecayProfile(skill);
  if (!profile || !skill.lastActiveDate) return 0;
  const decayDays = daysBetween(skill.lastActiveDate, today) - profile.graceDays;
  if (decayDays <= 0) return 0;
  const peak = Math.max(skill.peakLevel || skill.level, skill.level, 1);
  const floorLevel = Math.max(1, Math.round(peak * profile.floorPct));
  let working = { level: skill.level, xp: skill.xp };
  let totalLoss = 0;
  for (let i = 0; i < decayDays && working.level > floorLevel; i++) {
    const dailyLoss = skillXpThreshold(working.level) * profile.dailyRate;
    const next = addXp(working, -dailyLoss, skillXpThreshold);
    if (next.level < floorLevel) {
      // Last, partial step: only shed exactly enough to land on the floor, not past it.
      let toFloor = working.xp;
      for (let L = floorLevel; L < working.level; L++) toFloor += skillXpThreshold(L);
      totalLoss += toFloor;
      working = { level: floorLevel, xp: 0 };
      break;
    }
    totalLoss += dailyLoss;
    working = next;
  }
  return totalLoss;
}

// Runs decay for every skill against today's date and fans each skill's loss out to its
// linked stats — mirroring grantSkillXp's gain pipeline exactly, just running it
// backward. Advances lastActiveDate to today for anything that decayed, so a gap only
// ever gets charged once no matter how many times the app loads that day. Reports every
// stat/skill that lost anything (not just whole-level drops) — Henri wants a notice
// every time decay fires, even if it's just progress within the current level.
function applyDecay(skills, stats) {
  const today = todayStr();
  let skillsAcc = skills;
  let statsAcc = stats;
  const statLossMap = {};
  const skillReports = [];

  skills.forEach((skill) => {
    const loss = computeSkillDecay(skill, today);
    if (loss <= 0) return;
    const updatedSkill = { ...addXp(skill, -loss, skillXpThreshold), lastActiveDate: today };
    skillsAcc = skillsAcc.map((s) => (s.id === skill.id ? updatedSkill : s));
    skillReports.push({
      name: skill.name,
      beforeLevel: skill.level,
      afterLevel: updatedSkill.level,
      beforePct: Math.round((skill.xp / skillXpThreshold(skill.level)) * 100),
      afterPct: Math.round((updatedSkill.xp / skillXpThreshold(updatedSkill.level)) * 100),
    });
    (skill.statAffinities || []).forEach((aff) => {
      const share = loss * (aff.weight / 100);
      statsAcc = statsAcc.map((s) => (s.id === aff.statId ? addXp(s, -share) : s));
      statLossMap[aff.statId] = (statLossMap[aff.statId] || 0) + share;
    });
  });

  const statReports = Object.keys(statLossMap)
    .map((statId) => {
      const before = stats.find((s) => s.id === statId);
      const after = statsAcc.find((s) => s.id === statId);
      if (!before || !after) return null;
      return {
        name: before.name,
        beforeLevel: before.level,
        afterLevel: after.level,
        beforePct: Math.round((before.xp / xpThreshold(before.level)) * 100),
        afterPct: Math.round((after.xp / xpThreshold(after.level)) * 100),
      };
    })
    .filter(Boolean);

  return { skills: skillsAcc, stats: statsAcc, changed: Object.keys(statLossMap).length > 0, skillReports, statReports };
}

// ---------- Vices ----------
// A Vice debuffs its linked stats the moment it's logged — no waiting for a day
// boundary. The same vice can be logged more than once in a day (e.g. "Drank alcohol"
// three times at a party) — each log is independent, and `log` tracks a per-day count
// rather than a boolean. `applyViceLog`/`revertViceLog` are the positive/negative pair,
// same shape as grantSkillXp/revertSkillXp, so a misclick can be undone exactly (only
// ever undoes today's most recent log, never a past day's).
function applyViceLog(vice, stats, dateStr) {
  let statsAcc = stats;
  (vice.statAffinities || []).forEach((aff) => {
    const share = (vice.xpPerLog || 0) * (aff.weight / 100);
    if (share <= 0) return;
    statsAcc = statsAcc.map((s) => (s.id === aff.statId ? addXp(s, -share) : s));
  });
  const log = { ...(vice.log || {}) };
  log[dateStr] = (log[dateStr] || 0) + 1;
  return { vice: { ...vice, log }, stats: statsAcc };
}

function revertViceLog(vice, stats, dateStr) {
  const count = (vice.log || {})[dateStr] || 0;
  if (count <= 0) return { vice, stats };
  let statsAcc = stats;
  (vice.statAffinities || []).forEach((aff) => {
    const share = (vice.xpPerLog || 0) * (aff.weight / 100);
    if (share <= 0) return;
    statsAcc = statsAcc.map((s) => (s.id === aff.statId ? addXp(s, share) : s));
  });
  const log = { ...(vice.log || {}) };
  if (count - 1 <= 0) delete log[dateStr];
  else log[dateStr] = count - 1;
  return { vice: { ...vice, log }, stats: statsAcc };
}

// One-time cleanup for the short-lived v5/v6 "resolves at midnight" design: any vice
// still holding old pendingLog entries gets them applied immediately (as if logged
// today) and the old fields dropped, so nobody's already-logged vices get silently
// lost when this ships.
function migrateLegacyVicePending(vices, stats) {
  let statsAcc = stats;
  let changed = false;
  const nextVices = vices.map((vice) => {
    const pending = vice.pendingLog;
    if (!pending || Object.keys(pending).length === 0) {
      if (vice.pendingLog === undefined && vice.appliedLog === undefined) return vice;
      changed = true;
      const { pendingLog, appliedLog, ...rest } = vice;
      return rest;
    }
    changed = true;
    let v = vice;
    Object.keys(pending).forEach((dateStr) => {
      const result = applyViceLog(v, statsAcc, dateStr);
      v = result.vice;
      statsAcc = result.stats;
    });
    const { pendingLog: _p, appliedLog: _a, ...rest } = v;
    return rest;
  });
  return { vices: nextVices, stats: statsAcc, changed };
}

// generic leveling: works for Stats, Skills, and Overall by passing a threshold fn
function addXp(entity, delta, thresholdFn = xpThreshold) {
  let { level, xp } = entity;
  xp += delta;
  while (xp >= thresholdFn(level)) {
    xp -= thresholdFn(level);
    level += 1;
  }
  while (xp < 0 && level > 1) {
    level -= 1;
    xp += thresholdFn(level);
  }
  if (xp < 0) xp = 0;
  return { ...entity, level, xp };
}

// Overall Character Level is a pure readout, not its own XP track: the average of every
// stat's fractional level (level + progress toward its next level). It moves only when
// stats move — i.e. only through skills with stat affinities — and needs no storage of
// its own, so it can never drift out of sync with the stats it's summarizing.
function deriveOverall(stats) {
  if (!stats.length) return { level: 1, xp: 0, pct: 0 };
  const avg = stats.reduce((sum, s) => sum + s.level + s.xp / xpThreshold(s.level), 0) / stats.length;
  const level = Math.max(1, Math.floor(avg));
  const pct = Math.max(0, Math.min(100, (avg - level) * 100));
  return { level, xp: avg - level, pct };
}

function rankOf(level) {
  if (level >= 50) return "Grandmaster";
  if (level >= 35) return "Master";
  if (level >= 20) return "Expert";
  if (level >= 10) return "Adept";
  if (level >= 5) return "Apprentice";
  return "Novice";
}

// Overall Level badge — a distinct icon/shape/name every 5 levels, capped at the level-46+
// tier (level 50 is treated as a distant, maybe-never-reached target, not something worth
// designing indefinitely past).
const LEVEL_TIERS = [
  { max: 5, icon: Hexagon, name: "Novice", shape: "tier-shape-0" },
  { max: 10, icon: Shield, name: "Initiate", shape: "tier-shape-1" },
  { max: 15, icon: Award, name: "Adept", shape: "tier-shape-2" },
  { max: 20, icon: Star, name: "Skilled", shape: "tier-shape-3" },
  { max: 25, icon: Zap, name: "Veteran", shape: "tier-shape-4" },
  { max: 30, icon: Flame, name: "Elite", shape: "tier-shape-0 tier-glow-2" },
  { max: 35, icon: Gem, name: "Master", shape: "tier-shape-1 tier-glow-2" },
  { max: 40, icon: Crown, name: "Grandmaster", shape: "tier-shape-2 tier-glow-2" },
  { max: 45, icon: Swords, name: "Champion", shape: "tier-shape-3 tier-glow-2" },
  { max: Infinity, icon: Trophy, name: "Legend", shape: "tier-shape-4 tier-glow-2" },
];
function getLevelTier(level) {
  return LEVEL_TIERS.find((t) => level <= t.max) || LEVEL_TIERS[LEVEL_TIERS.length - 1];
}

function isDueToday(habit) {
  if (habit.freqType === "daily") return true;
  if (habit.freqType === "days") return (habit.days || []).includes(weekdayOf(todayStr()));
  if (habit.freqType === "flexible") return true;
  return true;
}
function weeklyCount(habit) {
  const week = currentWeekDates();
  return week.filter((d) => habit.completions[d]).length;
}
// Whether a given day was/is "critical" for a flexible (Nx/week) habit — i.e. whether
// skipping that specific day would make its week's target unreachable given the days
// actually left afterward. Shared by streakOf (walking backward through past days) and
// habitNeedsToday (checking just today), so the two can never drift out of sync.
function isDayCriticalForFlexible(habit, dateStr) {
  const week = weekDatesOf(dateStr);
  const idx = week.indexOf(dateStr);
  if (idx === -1) return false;
  const doneBefore = week.slice(0, idx).filter((d) => habit.completions[d]).length;
  const stillNeeded = (habit.target || 0) - doneBefore;
  if (stillNeeded <= 0) return false; // target already met without this day
  const daysLeftAfter = week.length - idx - 1;
  return stillNeeded > daysLeftAfter; // every remaining day, including this one, is required
}

function streakOf(habit) {
  let s = 0;
  let d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    let dueOnThatDay;
    if (habit.freqType === "days") dueOnThatDay = (habit.days || []).includes(d.getDay());
    else if (habit.freqType === "flexible") dueOnThatDay = isDayCriticalForFlexible(habit, key);
    else dueOnThatDay = true;
    if (habit.completions[key]) {
      s++;
      d.setDate(d.getDate() - 1);
    } else if (!dueOnThatDay) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return s;
}

// Whether skipping `habit` TODAY specifically would actually cost anything — used to
// decide whether the midnight countdown is worth showing. Not gated on an existing
// streak: even a fresh habit (streak 0) still feeds a skill, and skipping it is still a
// real (if small) step toward that skill/stat drifting into decay — so anything with a
// live skill link counts, not just habits currently on a streak.
// - "daily"/"days" habits: due-today already means today matters, full stop.
// - "flexible" (Nx/week) habits: today only matters if it's critical per
//   isDayCriticalForFlexible — same weekly-target math streakOf now uses, so a habit's
//   flame count and its countdown timer always agree on which days actually matter.
function habitNeedsToday(habit) {
  const connectedToStats = (habit.skillLinks || []).some((l) => l.weight > 0);
  if (!connectedToStats) return false;
  if (habit.freqType !== "flexible") return true;
  return isDayCriticalForFlexible(habit, todayStr());
}

// one-time migration: habits that still carry the old direct-to-stat link shape
// (statLinks: [{statId,xp}], or even older statId/statPoints) get converted into
// an auto-generated 1:1 skill, so the whole app runs through Skill -> Stat from here on.
function migrateHabitsToSkills(habits, existingSkills) {
  let skills = [...existingSkills];
  let changed = false;
  const newHabits = habits.map((h) => {
    if (h.skillLinks) return h; // already on the new system
    let oldLinks = h.statLinks;
    if (!oldLinks && h.statId) oldLinks = [{ statId: h.statId, xp: (h.statPoints || 1) * 50 }];
    if (!oldLinks || oldLinks.length === 0) return h; // never had a stat link — nothing to migrate

    const totalOldXp = oldLinks.reduce((sum, l) => sum + l.xp, 0) || 1;
    const skillId = uid();
    const statAffinities = oldLinks.map((l) => ({ statId: l.statId, weight: Math.round((l.xp / totalOldXp) * 100) }));
    skills.push({
      id: skillId,
      name: `${h.name} Training`,
      level: 1,
      xp: 0,
      totalXp: 0,
      statAffinities,
      dailyXp: 0,
      dailyXpDate: null,
    });
    changed = true;

    const rescaledXp = Math.max(10, Math.round(totalOldXp / 4));
    const { statId, statPoints, statLinks, ...rest } = h;
    return { ...rest, skillLinks: [{ skillId, weight: 100 }], xpPerCompletion: rescaledXp };
  });
  return { habits: newHabits, skills, changed };
}

// small, capped bonus: a skill's own governing stats (weighted by its affinities) speed up
// how fast that skill gains XP. Capped at +15% so practice stays the dominant factor.
function computeLearningBonus(skill, stats) {
  const affinities = skill.statAffinities || [];
  if (!affinities.length) return 1;
  let weightedSum = 0;
  let weightTotal = 0;
  affinities.forEach((a) => {
    const s = stats.find((st) => st.id === a.statId);
    if (s) {
      weightedSum += s.level * a.weight;
      weightTotal += a.weight;
    }
  });
  if (weightTotal === 0) return 1;
  const governingLevel = weightedSum / weightTotal;
  return 1 + Math.min(governingLevel * 0.002, 0.15);
}

// Core award pipeline — pure function of current state. Takes raw (pre-bonus, pre-cap) xp destined
// for each skill, applies the learning bonus then the daily per-skill cap, and fans out into Stats via
// each skill's affinities (with the Discipline streak bonus on that slice only). Overall Character
// Level is not tracked here — it's derived from Stats afterward (see deriveOverall). Returns exact
// per-skill/per-stat deltas so a later revertSkillXp() can undo precisely what this call granted,
// regardless of what else happens meanwhile.
function grantSkillXp(entries, { skills, stats, disciplineStreakDays = 0 }) {
  const today = todayStr();
  let skillsAcc = skills;
  let statsAcc = stats;
  const awardedSkills = [];
  const statDeltaMap = {};
  let actualTotal = 0;

  entries.forEach(({ skillId, rawAmount }) => {
    const skill = skillsAcc.find((s) => s.id === skillId);
    if (!skill || rawAmount <= 0) return;

    const learningBonus = computeLearningBonus(skill, statsAcc);
    const potential = rawAmount * learningBonus;

    let updated = { ...skill };
    if (updated.dailyXpDate !== today) {
      updated.dailyXp = 0;
      updated.dailyXpDate = today;
    }
    const remaining = Math.max(0, SKILL_DAILY_CAP - updated.dailyXp);
    const finalXp = Math.min(potential, remaining);
    if (finalXp <= 0) return;

    updated.dailyXp += finalXp;
    updated.totalXp = (updated.totalXp || 0) + finalXp;
    updated = addXp(updated, finalXp, skillXpThreshold);
    updated.lastActiveDate = today;
    updated.peakLevel = Math.max(updated.peakLevel || 0, updated.level);
    skillsAcc = skillsAcc.map((s) => (s.id === skillId ? updated : s));

    (skill.statAffinities || []).forEach((aff) => {
      const statMeta = statsAcc.find((s) => s.id === aff.statId);
      let share = finalXp * (aff.weight / 100);
      if (statMeta && statMeta.name === "Discipline" && disciplineStreakDays > 0) {
        share *= 1 + Math.min(disciplineStreakDays, 30) * 0.01;
      }
      statsAcc = statsAcc.map((s) => (s.id === aff.statId ? addXp(s, share) : s));
      statDeltaMap[aff.statId] = (statDeltaMap[aff.statId] || 0) + share;
    });

    actualTotal += finalXp;
    awardedSkills.push({ skillId, xp: finalXp });
  });

  const awardedStats = Object.entries(statDeltaMap).map(([statId, xp]) => ({ statId, xp }));
  return {
    skills: skillsAcc,
    stats: statsAcc,
    awardedSkills,
    awardedStats,
    totalXp: actualTotal,
  };
}

// Exact reversal of a previously-stored grantSkillXp() result — subtracts the same stored deltas
// directly, with no recomputation, so un-completing something always gives back precisely what
// completing it gave, no matter what else has happened to shared skills/stats in the meantime.
function revertSkillXp({ awardedSkills, awardedStats }, { skills, stats }) {
  const today = todayStr();
  const skillsAcc = skills.map((s) => {
    const hit = (awardedSkills || []).find((a) => a.skillId === s.id);
    if (!hit) return s;
    let updated = { ...s };
    if (updated.dailyXpDate === today) updated.dailyXp = Math.max(0, updated.dailyXp - hit.xp);
    return addXp(updated, -hit.xp, skillXpThreshold);
  });
  const statsAcc = stats.map((s) => {
    const hit = (awardedStats || []).find((a) => a.statId === s.id);
    return hit ? addXp(s, -hit.xp) : s;
  });
  return { skills: skillsAcc, stats: statsAcc };
}

// ---------- Task XP formula (Tasks only — Habits keep a flat xpPerCompletion by design) ----------

const TASK_BASE_XP = 20;
const DIFFICULTY_MULT = { easy: 0.8, normal: 1.0, hard: 1.25, very_hard: 1.5 };
const INTENSITY_MULT = { light: 0.85, moderate: 1.0, intense: 1.2, extreme: 1.35 };
const DIFFICULTY_LABELS = { easy: "Easy", normal: "Normal", hard: "Hard", very_hard: "Very Hard" };
const INTENSITY_LABELS = { light: "Light", moderate: "Moderate", intense: "Intense", extreme: "Extreme" };

// sqrt curve, capped at 240 effective minutes — no reward for running a timer past 4 hours.
// No duration entered at all = neutral 1.0x (manual completion without a timer).
function durationMult(minutes) {
  if (!minutes || minutes <= 0) return 1.0;
  const eff = Math.min(minutes, 240);
  return Math.sqrt(eff / 30);
}

function computeTaskRawXp(task) {
  const d = durationMult(task.duration ? parseFloat(task.duration) : null);
  const diff = DIFFICULTY_MULT[task.difficulty || "normal"];
  const inten = INTENSITY_MULT[task.intensity || "moderate"];
  let xp = TASK_BASE_XP * d * diff * inten;
  const isTrivial = (task.difficulty || "normal") === "easy" && (!task.duration || parseFloat(task.duration) < 5);
  if (isTrivial) xp = Math.min(xp, 5); // trivial-task floor
  return xp;
}

// repetition decay for completing the same-titled task multiple times in one day
function repetitionMultiplier(priorCompletionsToday) {
  if (priorCompletionsToday <= 0) return 1;
  if (priorCompletionsToday === 1) return 0.6;
  if (priorCompletionsToday === 2) return 0.3;
  return 0.1;
}

// ---------- tiny UI helpers ----------

function Bar({ pct, colorClass = "bg-emerald-500" }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="w-full h-2.5 bg-neutral-700 rounded-full overflow-hidden">
      <div className={`h-full ${colorClass} transition-all duration-500 rounded-full`} style={{ width: `${p}%` }} />
    </div>
  );
}
function Card({ children, className = "" }) {
  return <div className={`bg-neutral-800 border border-neutral-700 rounded-xl p-4 sys-panel ${className}`}>{children}</div>;
}

// ---------- System UI theme (visual layer only — no logic here) ----------
function SystemTheme() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');

      .system-app {
        background: radial-gradient(ellipse 70% 45% at 20% -10%, rgba(37,99,235,0.16), transparent 55%),
                    linear-gradient(180deg, #050810, #03050a 60%, #020408);
        font-family: 'Rajdhani', sans-serif;
        letter-spacing: 0.01em;
        color: #cfe9f7;
      }
      .system-app h1, .system-app h2, .system-app .sys-display,
      .system-app .text-lg.font-semibold {
        font-family: 'Orbitron', sans-serif;
        letter-spacing: 0.04em;
      }
      .system-app, .system-app * { scrollbar-color: rgba(59,130,246,0.4) transparent; }

      /* horizontal chip/tab strips: scrolling still works, just no visible
         scrollbar track — avoids the visible-then-fades flash these rows get
         on mount/unmount (tab switching) before the first user scroll */
      .system-app .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      .system-app .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }

      /* panels / cards / inputs -> glass */
      .system-app .bg-neutral-800, .system-app .bg-neutral-900, .system-app .bg-neutral-700 {
        background: linear-gradient(160deg, rgba(15,23,42,0.75), rgba(6,10,20,0.65)) !important;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }
      .system-app .bg-neutral-950 { background: transparent !important; }

      .system-app .sys-panel, .system-app .border-neutral-700 {
        border-color: rgba(59,130,246,0.3) !important;
        box-shadow: 0 0 0 1px rgba(59,130,246,0.06) inset, 0 0 16px -6px rgba(59,130,246,0.3);
      }
      .system-app .border-neutral-600, .system-app .border-neutral-500 {
        border-color: rgba(148,180,214,0.28) !important;
      }

      /* text hierarchy */
      .system-app .text-neutral-100, .system-app .text-neutral-200 { color: #e8f2fc !important; }
      .system-app .text-neutral-300 { color: #b9d4ef !important; }
      .system-app .text-neutral-400 { color: #7f9ebd !important; }
      .system-app .text-neutral-500, .system-app .text-neutral-600 { color: #56698a !important; }

      /* overall level badge — hexagonal "System" HUD tag, not a generic pill.
         shape + icon change every 5 levels; tier-glow-2 (levels 26+) intensifies the
         border/glow on the same 5 shapes rather than inventing new colors. */
      .level-badge {
        position: relative;
        background: linear-gradient(160deg, rgba(15,23,42,0.9), rgba(6,10,20,0.8));
        border: 1px solid rgba(74,143,237,0.55);
        box-shadow: 0 0 14px -2px rgba(59,130,246,0.55), inset 0 0 10px rgba(59,130,246,0.12);
        min-width: 68px;
      }
      .tier-shape-0 { -webkit-clip-path: polygon(14% 0%, 86% 0%, 100% 50%, 86% 100%, 14% 100%, 0% 50%); clip-path: polygon(14% 0%, 86% 0%, 100% 50%, 86% 100%, 14% 100%, 0% 50%); }
      .tier-shape-1 { -webkit-clip-path: polygon(0% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%); clip-path: polygon(0% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%); }
      .tier-shape-2 { -webkit-clip-path: polygon(22% 0%, 78% 0%, 100% 25%, 100% 75%, 78% 100%, 22% 100%, 0% 75%, 0% 25%); clip-path: polygon(22% 0%, 78% 0%, 100% 25%, 100% 75%, 78% 100%, 22% 100%, 0% 75%, 0% 25%); }
      .tier-shape-3 { -webkit-clip-path: polygon(0% 0%, 80% 0%, 100% 50%, 80% 100%, 0% 100%); clip-path: polygon(0% 0%, 80% 0%, 100% 50%, 80% 100%, 0% 100%); }
      .tier-shape-4 { -webkit-clip-path: polygon(10% 0%, 90% 0%, 100% 25%, 100% 100%, 0% 100%, 0% 25%); clip-path: polygon(10% 0%, 90% 0%, 100% 25%, 100% 100%, 0% 100%, 0% 25%); }
      .tier-glow-2 {
        border: 1.5px solid rgba(94,179,255,0.85);
        box-shadow: 0 0 22px -1px rgba(59,130,246,0.85), inset 0 0 12px rgba(94,179,255,0.22);
      }

      /* single accent hue: electric blue, flat fills + glow instead of gradients */
      .system-app .bg-violet-600, .system-app .bg-violet-500 {
        background: #2f6feb !important;
        border-color: transparent !important;
        box-shadow: 0 0 16px -2px rgba(59,130,246,0.7);
      }
      .system-app .border-violet-500 {
        border-color: #4a8fed !important;
        box-shadow: 0 0 10px -2px rgba(74,143,237,0.6);
      }
      .system-app .text-violet-600, .system-app .text-violet-800 { color: #5eb3ff !important; }
      .system-app .hover\\:text-violet-800:hover { color: #8ecbff !important; }
      .system-app .stroke-violet-500 { stroke: #4a8fed; filter: drop-shadow(0 0 4px rgba(74,143,237,0.7)); }
      .system-app .stroke-emerald-500 { stroke: #5eb3ff; filter: drop-shadow(0 0 4px rgba(94,179,255,0.7)); }
      .system-app .stroke-neutral-700 { stroke: rgba(59,130,246,0.12); }

      /* progress bars — flat, not two-tone */
      .system-app .bg-emerald-500, .system-app .bg-emerald-600 {
        background: #4a8fed !important;
        box-shadow: 0 0 10px -1px rgba(74,143,237,0.7);
      }
      .system-app .bg-blue-500 {
        background: #2f6feb !important;
        box-shadow: 0 0 10px -1px rgba(47,111,235,0.6);
      }
      .system-app .border-emerald-500 { border-color: #4a8fed !important; }

      /* orange (habit day-selector, streak flame) was the other stray hue — same blue treatment */
      .system-app .bg-orange-500 {
        background: #2f6feb !important;
        border-color: transparent !important;
        box-shadow: 0 0 16px -2px rgba(59,130,246,0.7);
      }
      .system-app .border-orange-500 { border-color: #4a8fed !important; }
      .system-app .text-orange-500 { color: #5eb3ff !important; }

      /* status colors — no gold/amber; warnings fold into the same red used for danger,
         keeping strictly to blue accent + red alert, nothing else */
      .system-app .text-amber-600 { color: #fb7185 !important; text-shadow: 0 0 6px rgba(251,113,133,0.4); }
      .system-app .text-red-500, .system-app .hover\\:text-red-500:hover { color: #fb7185 !important; }

      .system-app .hover\\:bg-neutral-700:hover { background: rgba(59,130,246,0.1) !important; }
      .system-app .hover\\:text-neutral-200:hover,
      .system-app .hover\\:text-neutral-300:hover,
      .system-app .hover\\:text-neutral-400:hover { color: #a8ccff !important; }

      .system-app input, .system-app textarea {
        background: rgba(6,10,20,0.65) !important;
        color: #e8f2fc !important;
        caret-color: #4a8fed;
      }
      .system-app input::placeholder, .system-app textarea::placeholder {
        color: #4d6280 !important;
        opacity: 1;
      }
      .system-app input:focus, .system-app textarea:focus {
        box-shadow: 0 0 0 1px rgba(74,143,237,0.5), 0 0 14px -2px rgba(74,143,237,0.5);
      }

      .notif-overlay { animation: notifFadeIn 0.2s ease-out; }
      @keyframes notifFadeIn { from { opacity: 0; } to { opacity: 1; } }
      .notif-panel {
        clip-path: polygon(16px 0%, 100% 0%, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0% 100%, 0% 16px);
        animation: notifPop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes notifPop { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .notif-glow-line { height: 1px; background: linear-gradient(90deg, transparent, rgba(94,179,255,0.9), transparent); }

      .system-app .transition-all { transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
    `}</style>
  );
}

// ---------- Onboarding wizard ----------

function OnboardingWizard({ apiKey, geminiKey, onSetApiKey, onSetGeminiKey, onComplete, onSkip }) {
  const [step, setStep] = useState(0); // 0 = intro, 1..8 = one per stat, 9 = skill picker, 10 = calculating
  const [answers, setAnswers] = useState({}); // statName -> [value, value, ...] (index = selected choice OR raw numeric string)
  const [strength, setStrength] = useState({ bodyweight: "" }); // exercise id -> "reps"/"weight"/"reps2" fields, plus bodyweight
  const [notes, setNotes] = useState({}); // statName -> free-text achievements
  const [pickedSkills, setPickedSkills] = useState(() => new Set(PRESET_SKILLS.map((s) => s.name)));
  const [skillDuration, setSkillDuration] = useState({}); // skill name -> SKILL_DURATION_OPTIONS index
  const [skillFrequency, setSkillFrequency] = useState({}); // skill name -> SKILL_FREQUENCY_OPTIONS index
  const [working, setWorking] = useState(false);

  const SKILL_PICKER_STEP = MAIN_STAT_NAMES.length + 1;
  const togglePreset = (name) =>
    setPickedSkills((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const statName = step >= 1 && step <= MAIN_STAT_NAMES.length ? MAIN_STAT_NAMES[step - 1] : null;
  const isStrength = statName === "Strength";
  const questions = statName && !isStrength ? STAT_BENCHMARKS[statName] : null;
  const current = (statName && answers[statName]) || [];
  const canProceed = isStrength || !statName || questions.every((q, i) => q.type === "numeric" || (current[i] !== null && current[i] !== undefined));

  const selectAnswer = (qIdx, value) => {
    setAnswers((prev) => {
      const next = [...(prev[statName] || [])];
      next[qIdx] = value;
      return { ...prev, [statName]: next };
    });
  };
  const useAverage = () => {
    if (!isStrength) setAnswers((prev) => ({ ...prev, [statName]: questions.map(() => 2) }));
    setStep((s) => s + 1);
  };
  const setStrengthField = (key, value) => setStrength((prev) => ({ ...prev, [key]: value }));

  const scoreStat = (name) => {
    const idxs = answers[name] || [];
    const qs = STAT_BENCHMARKS[name];
    const pts = qs
      .map((q, i) => {
        if (q.type === "numeric") {
          const raw = idxs[i];
          if (raw === undefined || raw === null || raw === "") return null;
          return interpolatePoints(q.breakpoints, parseFloat(raw), q.decel);
        }
        return idxs[i] !== undefined && idxs[i] !== null ? TIER_POINTS[idxs[i]] : null;
      })
      .filter((p) => p !== null);
    if (!pts.length) return 10; // nothing answered -> assume average
    return Math.max(1, Math.round(pts.reduce((a, b) => a + b, 0) / pts.length));
  };

  const scoreStrength = () => {
    const bw = parseFloat(strength.bodyweight);
    const pts = [];
    STRENGTH_EXERCISES.forEach((ex) => {
      if (ex.kind === "reps") {
        const reps = parseFloat(strength[`${ex.id}_reps`]);
        if (Number.isFinite(reps)) pts.push(interpolatePoints(ex.breakpoints, reps));
      } else {
        const w = parseFloat(strength[`${ex.id}_weight`]);
        const r = parseFloat(strength[`${ex.id}_reps`]);
        if (Number.isFinite(w) && w > 0 && Number.isFinite(bw) && bw > 0) {
          const oneRm = estimate1RM(w, r);
          pts.push(interpolatePoints(ex.breakpoints, oneRm / bw));
        }
      }
    });
    if (!pts.length) return 10;
    return Math.max(1, Math.round(pts.reduce((a, b) => a + b, 0) / pts.length));
  };

  const finish = async () => {
    setStep(SKILL_PICKER_STEP + 1);
    setWorking(true);
    const baseLevels = {};
    MAIN_STAT_NAMES.forEach((name) => {
      baseLevels[name] = name === "Strength" ? scoreStrength() : scoreStat(name);
    });

    let finalLevels = baseLevels;
    const hasNotes = Object.values(notes).some((n) => n && n.trim());
    if (hasNotes) {
      try {
        const prompt = `You are calibrating a personal RPG stat system where an average, untrained adult = Level 10. The scale runs roughly: 5 = below average, 10 = average, 20 = above average/recreational, 35 = advanced/competitive, 50+ = elite/exceptional (world class).

Base levels already computed from a structured questionnaire: ${JSON.stringify(baseLevels)}
Additional self-reported achievements/notes per stat (may be empty): ${JSON.stringify(notes)}

For each stat, only adjust the base level if its notes contain a specific, credible achievement that the questionnaire wouldn't have captured (e.g. a competition result, certification, or measurable record). If a stat has no notes, or the notes don't add new information, keep its base level unchanged.

Scale the SIZE of the adjustment to how significant and specific the achievement actually is — 15 levels is a rare ceiling for something truly exceptional, not a default:
- Vague or minor (e.g. "I read a lot", "played sports in school"): 1-3 levels
- Solid, concrete, but not exceptional (e.g. "finished a half marathon", "built a small side project"): 4-8 levels
- Genuinely impressive with a specific, credible result (e.g. "state-level competition podium", "published research", "certified expert"): 9-15 levels
Most notes should land in the low-to-mid range. Only reach for the full ±15 when the achievement is truly exceptional and specific enough to justify it.

Respond with ONLY a JSON object mapping each of these exact stat names to an integer level, nothing else: ${JSON.stringify(MAIN_STAT_NAMES)}`;
        const text = await callClaudeAI(prompt, 400, { apiKey, geminiKey });
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          finalLevels = { ...baseLevels };
          MAIN_STAT_NAMES.forEach((name) => {
            const v = parsed[name];
            if (typeof v === "number" && Number.isFinite(v)) {
              const lo = baseLevels[name] - 15;
              const hi = baseLevels[name] + 15;
              finalLevels[name] = Math.max(1, Math.min(hi, Math.max(lo, Math.round(v))));
            }
          });
        }
      } catch (e) {
        // AI unavailable — the structured questionnaire levels stand on their own,
        // no heuristic fallback for this one by design.
        setAIStatus("Local heuristic (no AI)", e.message);
      }
    }

    onComplete(finalLevels, Array.from(pickedSkills), skillDuration, skillFrequency);
  };

  return (
    <div className="p-5 space-y-4 min-h-[600px] flex flex-col">
      <div className="flex items-center gap-2">
        <Award size={18} className="text-violet-600" />
        <h1 className="text-lg font-semibold text-neutral-100 sys-display">Character Setup</h1>
      </div>

      {step === 0 && (
        <div className="flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              Before your first quest, let's calibrate your starting stats. Answer a couple of quick questions per
              stat about where you're at right now — running, lifting, habits, all of it.
            </p>
            <p className="text-sm text-neutral-400">
              The scale is anchored so an <span className="text-neutral-200 font-medium">average, untrained adult
              sits at Level 10</span> in every stat. Below that if you're behind the curve, well above it if you're
              already strong in an area.
            </p>
            <p className="text-xs text-neutral-500">Takes about 2 minutes. You can redo this anytime from Settings.</p>

            <div className="border-t border-neutral-800 pt-3 space-y-2">
              <p className="text-xs text-neutral-400">
                Optional but recommended: add a Gemini API key so your notable achievements below actually get
                weighed by AI, not just the questionnaire. Free, no card — get one at{" "}
                <span className="text-neutral-300">aistudio.google.com/apikey</span>.
              </p>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => onSetGeminiKey?.(e.target.value)}
                placeholder="Gemini API key"
                className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
              />
              {geminiKey && <p className="text-xs text-emerald-500">Key saved — achievements will be AI-weighted.</p>}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={onSkip} className="flex-1 border border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400">
              Skip — start everyone at Lv. 1
            </button>
            <button onClick={() => setStep(1)} className="flex-1 bg-violet-600 text-white rounded-lg py-2.5 text-sm font-medium">
              Begin
            </button>
          </div>
        </div>
      )}

      {isStrength && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-neutral-500">
              Stat {step} of {MAIN_STAT_NAMES.length}
            </span>
            <button onClick={useAverage} className="text-xs text-neutral-500 hover:text-neutral-300">
              Not sure — use average
            </button>
          </div>
          <h2 className="text-base font-semibold text-neutral-100 mb-1">Strength</h2>
          <p className="text-xs text-neutral-500 mb-3">Enter what you know — everything here is optional, whatever you fill in gets averaged.</p>

          <div className="space-y-3.5 flex-1">
            <div>
              <p className="text-xs text-neutral-400 mb-1.5">Bodyweight (needed to score squat/deadlift accurately)</p>
              <input
                type="number"
                value={strength.bodyweight}
                onChange={(e) => setStrengthField("bodyweight", e.target.value)}
                placeholder="kg"
                className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
              />
            </div>

            {STRENGTH_EXERCISES.map((ex) => (
              <div key={ex.id}>
                <p className="text-xs text-neutral-400 mb-1.5">{ex.label}</p>
                {ex.kind === "reps" ? (
                  <input
                    type="number"
                    value={strength[`${ex.id}_reps`] || ""}
                    onChange={(e) => setStrengthField(`${ex.id}_reps`, e.target.value)}
                    placeholder={ex.unit}
                    className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
                  />
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={strength[`${ex.id}_weight`] || ""}
                      onChange={(e) => setStrengthField(`${ex.id}_weight`, e.target.value)}
                      placeholder="kg"
                      className="flex-1 border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
                    />
                    <input
                      type="number"
                      value={strength[`${ex.id}_reps`] || ""}
                      onChange={(e) => setStrengthField(`${ex.id}_reps`, e.target.value)}
                      placeholder="reps"
                      className="flex-1 border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
                    />
                  </div>
                )}
              </div>
            ))}

            <div>
              <p className="text-xs text-neutral-400 mb-1.5">Notable achievements (optional — e.g. "state powerlifting meet, 2022")</p>
              <textarea
                value={notes.Strength || ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, Strength: e.target.value }))}
                placeholder="Leave blank if nothing specific"
                rows={2}
                className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-xs bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => setStep((s) => s - 1)} className="flex-1 border border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400">
              Back
            </button>
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 bg-violet-600 text-white rounded-lg py-2.5 text-sm font-medium"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {statName && !isStrength && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-neutral-500">
              Stat {step} of {MAIN_STAT_NAMES.length}
            </span>
            <button onClick={useAverage} className="text-xs text-neutral-500 hover:text-neutral-300">
              Not sure — use average
            </button>
          </div>
          <h2 className="text-base font-semibold text-neutral-100 mb-3">{statName}</h2>

          <div className="space-y-4 flex-1">
            {questions.map((q, qIdx) =>
              q.type === "numeric" ? (
                <div key={qIdx}>
                  <p className="text-xs text-neutral-400 mb-1.5">
                    {q.prompt}
                    {q.unit ? ` (${q.unit})` : ""}
                  </p>
                  <input
                    type="number"
                    value={current[qIdx] ?? ""}
                    onChange={(e) => selectAnswer(qIdx, e.target.value)}
                    placeholder={q.placeholder}
                    className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
                  />
                </div>
              ) : (
                <div key={qIdx}>
                  <p className="text-xs text-neutral-400 mb-1.5">{q.prompt}</p>
                  <div className="space-y-1.5">
                    {q.options.map((opt, optIdx) => (
                      <button
                        key={optIdx}
                        onClick={() => selectAnswer(qIdx, optIdx)}
                        className={`w-full text-left text-xs py-2 px-3 rounded-lg border ${
                          current[qIdx] === optIdx ? "bg-violet-600 text-white border-violet-500" : "border-neutral-600 text-neutral-400"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            <div>
              <p className="text-xs text-neutral-400 mb-1.5">Notable achievements (optional — e.g. "ran a marathon in 2023", "state chess champion")</p>
              <textarea
                value={notes[statName] || ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [statName]: e.target.value }))}
                placeholder="Leave blank if nothing specific"
                rows={2}
                className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-xs bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 border border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400"
            >
              Back
            </button>
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed}
              className="flex-1 bg-violet-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === SKILL_PICKER_STEP && (
        <div className="flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              A few starter skills, wired to the stats you just set for future XP — but each one's{" "}
              <span className="text-neutral-200 font-medium">starting level comes from how long and how often</span>{" "}
              you've actually done it, not from the stat. Deselect anything that doesn't apply.
            </p>
            <div className="space-y-1.5">
              {PRESET_SKILLS.map((s) => {
                const checked = pickedSkills.has(s.name);
                const durationIdx = skillDuration[s.name] ?? 2;
                const frequencyIdx = skillFrequency[s.name] ?? 2;
                const neverTried = durationIdx === 0;
                return (
                  <div
                    key={s.name}
                    className={`border rounded-lg px-3 py-2 space-y-1.5 ${checked ? "border-neutral-700" : "border-neutral-800 opacity-50"}`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePreset(s.name)}
                        className="w-4 h-4 accent-violet-600"
                      />
                      <span className="text-sm text-neutral-200 flex-1">{s.name}</span>
                      <span className="text-xs text-neutral-500">{s.stats.map(([n, w]) => `${n} ${w}%`).join(", ")}</span>
                    </label>
                    {checked && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          value={durationIdx}
                          onChange={(e) => setSkillDuration((prev) => ({ ...prev, [s.name]: Number(e.target.value) }))}
                          className="border border-neutral-600 rounded-md px-2 py-1.5 text-xs bg-neutral-800 text-neutral-200 outline-none focus:border-neutral-500"
                        >
                          {SKILL_DURATION_OPTIONS.map((o, i) => (
                            <option key={o.label} value={i}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={frequencyIdx}
                          disabled={neverTried}
                          onChange={(e) => setSkillFrequency((prev) => ({ ...prev, [s.name]: Number(e.target.value) }))}
                          className="border border-neutral-600 rounded-md px-2 py-1.5 text-xs bg-neutral-800 text-neutral-200 outline-none focus:border-neutral-500 disabled:opacity-40"
                        >
                          {SKILL_FREQUENCY_OPTIONS.map((o, i) => (
                            <option key={o.label} value={i}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={finish} className="flex-1 bg-violet-600 text-white rounded-lg py-2.5 text-sm font-medium">
              Calculate my level
            </button>
          </div>
        </div>
      )}

      {step > SKILL_PICKER_STEP && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-neutral-400">{working ? "Calculating your starting stats..." : "Done."}</p>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "today", label: "Today", icon: ListTodo },
  { id: "goals", label: "Goals", icon: Target },
  { id: "habits", label: "Habits", icon: Flame },
  { id: "vices", label: "Vices", icon: Skull },
  { id: "skills", label: "Skills", icon: BookOpen },
  { id: "workouts", label: "Workouts", icon: Dumbbell },
  { id: "week", label: "Week", icon: TrendingUp },
];

// ---------- App ----------

export default function ProgressTracker({ readOnly = false, onLogout }) {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("today");
  const [tasks, setTasks] = useState([]);
  const [goals, setGoals] = useState([]);
  const [habits, setHabits] = useState([]);
  const [vices, setVices] = useState([]);
  const [stats, setStats] = useState([]);
  const [skills, setSkills] = useState([]);
  const overall = useMemo(() => deriveOverall(stats), [stats]);
  const [exercises, setExercises] = useState([]);
  const [workoutCategories, setWorkoutCategories] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [apiKey, setApiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [onboarded, setOnboarded] = useState(true); // default true so returning users never flash the wizard before load resolves
  const [decayNotice, setDecayNotice] = useState(null);
  const [preWorkoutsTab, setPreWorkoutsTab] = useState("today"); // remembers where "back" from the focused Workouts view should land
  const [aiStatus, setAiStatusState] = useState(getAIStatus());
  useEffect(() => subscribeAIStatus(setAiStatusState), []);

  useEffect(() => {
    (async () => {
      const [t, g, h, s, sk, ex, cats, catsSeeded, logs, legacyWorkouts, snaps, key, gkey, ob, vc] = await Promise.all([
        load("tasks", []),
        load("goals", []),
        load("habits", []),
        load("stats", []),
        load("skills", []),
        load("exercises", []),
        load("workoutCategories", []),
        load("workoutCategoriesSeeded", false),
        load("workoutLogs", []),
        load("workouts", []),
        load("snapshots", []),
        load("apiKey", ""),
        load("geminiKey", ""),
        load("onboarded", false),
        load("vices", []),
      ]);
      setTasks(t);
      setGoals(g);

      const seededStats = ensureMainStats(s);
      if (seededStats.length !== s.length) save("stats", seededStats);

      const migration = migrateHabitsToSkills(h, sk);
      const fieldsBackfill = ensureDecayFields(migration.skills);
      const decayResult = applyDecay(fieldsBackfill.skills, seededStats);
      const legacyVices = migrateLegacyVicePending(vc, decayResult.stats);
      if (migration.changed) save("habits", migration.habits);
      if (migration.changed || fieldsBackfill.changed || decayResult.changed) save("skills", decayResult.skills);
      if (decayResult.changed || legacyVices.changed) save("stats", legacyVices.stats);
      if (legacyVices.changed) save("vices", legacyVices.vices);
      setHabits(migration.habits);
      setSkills(decayResult.skills);
      setStats(legacyVices.stats);
      setVices(legacyVices.vices);
      if (decayResult.statReports.length) setDecayNotice({ statReports: decayResult.statReports.map((r) => ({ ...r, cause: "Decay" })) });

      // one-time migration from the old flat workouts shape
      let finalExercises = ex;
      let finalLogs = logs;
      if (ex.length === 0 && logs.length === 0 && legacyWorkouts.length > 0) {
        const nameToId = {};
        legacyWorkouts.forEach((w) => {
          if (!nameToId[w.exercise]) nameToId[w.exercise] = uid();
        });
        finalExercises = Object.entries(nameToId).map(([name, id]) => ({ id, name }));
        finalLogs = legacyWorkouts.map((w) => ({ id: w.id, exerciseId: nameToId[w.exercise], date: w.date, sets: w.sets }));
        save("exercises", finalExercises);
        save("workoutLogs", finalLogs);
      }
      setExercises(finalExercises);
      setWorkoutLogs(finalLogs);

      // seed default workout-split categories exactly once — if Henri later
      // deletes all of them on purpose, catsSeeded staying true stops them
      // from silently coming back on next load
      let finalCats = cats;
      if (!catsSeeded) {
        finalCats = DEFAULT_WORKOUT_CATEGORIES.map((name) => ({ id: uid(), name }));
        save("workoutCategories", finalCats);
        save("workoutCategoriesSeeded", true);
      }
      setWorkoutCategories(finalCats);

      setSnapshots(snaps);
      setApiKey(key);
      setGeminiKey(gkey);
      setOnboarded(ob);

      setReady(true);
    })();
  }, []);

  const persistTasks = useCallback((next) => {
    setTasks(next);
    save("tasks", next);
  }, []);
  const persistGoals = useCallback((next) => {
    setGoals(next);
    save("goals", next);
  }, []);
  const persistHabits = useCallback((next) => {
    setHabits(next);
    save("habits", next);
  }, []);
  const persistVices = useCallback((next) => {
    setVices(next);
    save("vices", next);
  }, []);
  const persistStats = useCallback((next) => {
    setStats(next);
    save("stats", next);
  }, []);
  const persistSkills = useCallback((next) => {
    setSkills(next);
    save("skills", next);
  }, []);

  // Decay was only ever evaluated once, in the mount effect above — fine for a page
  // that gets fully reloaded daily, but this is an installed PWA Henri leaves open for
  // days at a time, so the mount effect never re-fires and decay silently stops
  // accruing past the first day of any given session. skillsRef/statsRef mirror the
  // latest state so checkDecay (fired from outside React's render cycle, on
  // visibility/focus/interval) always reads current values instead of a stale
  // closure. applyDecay itself is safe to call repeatedly — it's a no-op once
  // lastActiveDate has already been advanced to today for a given skill.
  const skillsRef = useRef(skills);
  const statsRef = useRef(stats);
  useEffect(() => {
    skillsRef.current = skills;
  }, [skills]);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const checkDecay = useCallback(() => {
    const result = applyDecay(skillsRef.current, statsRef.current);
    if (!result.changed) return;
    persistSkills(result.skills);
    persistStats(result.stats);
    setDecayNotice({ statReports: result.statReports.map((r) => ({ ...r, cause: "Decay" })) });
  }, [persistSkills, persistStats]);

  // Re-check whenever the app regains attention (tab refocused, PWA resumed from
  // background) plus a periodic safety-net interval for sessions left open and
  // visible for a long stretch (e.g. an always-on PC dashboard) — covers day
  // rollovers that happen while nobody ever triggers a visibility/focus event.
  useEffect(() => {
    if (!ready) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkDecay();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", checkDecay);
    const interval = setInterval(checkDecay, 30 * 60 * 1000); // 30 min safety net
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkDecay);
      clearInterval(interval);
    };
  }, [ready, checkDecay]);
  const persistExercises = useCallback((next) => {
    setExercises(next);
    save("exercises", next);
  }, []);
  const persistWorkoutCategories = useCallback((next) => {
    setWorkoutCategories(next);
    save("workoutCategories", next);
  }, []);
  const persistWorkoutLogs = useCallback((next) => {
    setWorkoutLogs(next);
    save("workoutLogs", next);
  }, []);
  const persistSnapshots = useCallback((next) => {
    setSnapshots(next);
    save("snapshots", next);
  }, []);
  const persistApiKey = useCallback((next) => {
    setApiKey(next);
    save("apiKey", next);
  }, []);
  const persistGeminiKey = useCallback((next) => {
    setGeminiKey(next);
    save("geminiKey", next);
  }, []);
  const persistOnboarded = useCallback((next) => {
    setOnboarded(next);
    save("onboarded", next);
  }, []);

  const handleOnboardingComplete = useCallback(
    (levels, presetSkillNames = [], skillDuration = {}, skillFrequency = {}) => {
      const updated = stats.map((s) => (s.isMain && levels[s.name] != null ? { ...s, level: levels[s.name], xp: 0 } : s));
      persistStats(updated);
      if (presetSkillNames.length) {
        const newSkills = PRESET_SKILLS.filter((s) => presetSkillNames.includes(s.name)).map((s) => ({
          id: uid(),
          name: s.name,
          // Starting level comes from the duration/frequency questions for
          // THIS skill, not the stat it's linked to — the stat split below
          // only governs which stat future XP from this skill feeds into.
          level: computeSkillLevel(skillDuration[s.name] ?? 2, skillFrequency[s.name] ?? 2),
          xp: 0,
          totalXp: 0,
          statAffinities: s.stats.map(([statName, weight]) => ({ statId: mainStatId(statName), weight })),
          dailyXp: 0,
          dailyXpDate: null,
        }));
        // Recalibration can re-run this with the same presets selected —
        // replace any existing skill with the same name instead of
        // duplicating it. Custom/manual skills and unchecked presets are
        // left untouched.
        const presetNamesLower = new Set(presetSkillNames.map((n) => n.toLowerCase()));
        const kept = skills.filter((existing) => !presetNamesLower.has(existing.name.toLowerCase()));
        persistSkills([...kept, ...newSkills]);
      }
      persistOnboarded(true);
    },
    [stats, skills, persistStats, persistSkills, persistOnboarded]
  );
  const handleOnboardingSkip = useCallback(() => persistOnboarded(true), [persistOnboarded]);

  const resetAllData = useCallback(async () => {
    const keys = ["tasks", "goals", "habits", "stats", "skills", "exercises", "workoutCategories", "workoutLogs", "workouts", "snapshots", "vices", "onboarded", "workoutCategoriesSeeded"];
    const falseKeys = new Set(["onboarded", "workoutCategoriesSeeded"]);
    await Promise.all(keys.map((k) => save(k, falseKeys.has(k) ? false : [])));
    window.location.reload();
  }, []);

  const todayTasks = tasks.filter((t) => t.date === todayStr());
  const habitsToday = habits.filter(isDueToday);
  const doneCount = todayTasks.filter((t) => t.completed).length + habitsToday.filter((h) => h.completions[todayStr()]).length;
  const totalCount = todayTasks.length + habitsToday.length;
  const todayPct = totalCount ? (doneCount / totalCount) * 100 : 0;

  if (!ready) return <div className="p-8 text-neutral-500 text-sm">Loading...</div>;

  if (!onboarded && readOnly) {
    return (
      <div className="system-app w-full min-h-screen md:min-h-[700px] md:max-w-2xl md:mx-auto md:my-10 bg-neutral-950 md:rounded-2xl overflow-hidden md:border md:border-neutral-700 flex items-center justify-center p-8 text-center">
        <SystemTheme />
        <p className="text-sm" style={{ color: "#cfe9f7" }}>Not set up yet — complete onboarding on your phone first, then refresh here.</p>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div className="system-app w-full min-h-screen md:min-h-[700px] md:max-w-2xl md:mx-auto md:my-10 bg-neutral-950 md:rounded-2xl overflow-hidden md:border md:border-neutral-700">
        <SystemTheme />
        <OnboardingWizard
          apiKey={apiKey}
          geminiKey={geminiKey}
          onSetApiKey={persistApiKey}
          onSetGeminiKey={persistGeminiKey}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </div>
    );
  }

  return (
    <div className="system-app w-full min-h-screen md:min-h-[700px] md:max-w-2xl md:mx-auto md:my-10 bg-neutral-950 md:rounded-2xl overflow-hidden md:border md:border-neutral-700">
      <SystemTheme />
      {tab !== "workouts" && (
        <div className="p-5 pb-3 border-b border-neutral-700 bg-neutral-800 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-100">Progress</h1>
            <p className="text-sm text-neutral-400">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
          <div className={`level-badge ${getLevelTier(overall.level).shape} flex flex-col items-center justify-center py-1 shrink-0`}>
            <div className="flex items-center gap-1">
              {(() => {
                const TierIcon = getLevelTier(overall.level).icon;
                return <TierIcon size={11} style={{ color: "#5eb3ff" }} />;
              })()}
              <span className="sys-display text-sm font-bold leading-none" style={{ color: "#e8f2fc" }}>
                {overall.level}
              </span>
            </div>
            <span className="text-[8px] uppercase tracking-wider leading-none mt-0.5" style={{ color: "#7f9ebd" }}>
              {getLevelTier(overall.level).name}
            </span>
          </div>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="text-neutral-400 hover:text-neutral-200 shrink-0 ml-2"
            title="AI settings"
          >
            <Settings size={18} />
          </button>
        </div>
      )}

      {decayNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 notif-overlay"
          style={{ background: "rgba(2,4,8,0.72)", backdropFilter: "blur(3px)" }}
          onClick={() => setDecayNotice(null)}
        >
          <div className="notif-panel w-full max-w-sm bg-neutral-900 border border-neutral-700 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingDown size={14} className="text-red-500" />
              <p className="sys-display text-[11px] font-bold uppercase tracking-[0.25em] text-neutral-200">System Notification</p>
            </div>
            <div className="notif-glow-line mb-3" />
            <p className="text-xs text-neutral-400 text-center mb-3">Decay detected. The following have weakened from inactivity:</p>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {decayNotice.statReports.map((r, i) => (
                <div key={`${r.name}-${i}`} className="flex items-center justify-between text-sm gap-2">
                  <div className="min-w-0">
                    <span className="text-neutral-200">{r.name}</span>
                    <span className="text-neutral-500 text-[10px] ml-1.5">{r.cause}</span>
                  </div>
                  <span className="text-red-500 font-medium sys-display shrink-0">
                    {r.beforeLevel !== r.afterLevel ? `Lv.${r.beforeLevel} → Lv.${r.afterLevel}` : `−${Math.max(0, r.beforePct - r.afterPct)}%`}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setDecayNotice(null)}
              className="w-full py-2 bg-violet-600 text-white text-xs font-semibold uppercase tracking-widest sys-display"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {showSettings && tab !== "workouts" && (
        <div className="p-4 border-b border-neutral-700 bg-neutral-900 space-y-3">
          <div>
            <p className="text-xs text-neutral-400 mb-1.5">
              <span className="text-neutral-200 font-medium">Gemini API key</span> — free tier, recommended for standalone use.
              Get one at aistudio.google.com/apikey (no card needed). Auto-detect uses this once the free Claude.ai proxy is
              gone.
            </p>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => persistGeminiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <p className="text-xs text-neutral-400 mb-1.5">
              <span className="text-neutral-200 font-medium">Anthropic API key</span> — optional, paid, only used if Gemini isn't set.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => persistApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 text-neutral-100 outline-none focus:border-violet-500"
            />
          </div>
          <p className="text-xs text-neutral-500">Keys are stored locally only, never sent anywhere except directly to the provider.</p>
          <p className="text-xs text-neutral-500">
            Last AI classification:{" "}
            <span style={{ color: aiStatus.provider?.startsWith("Local") ? "#fb7185" : "#5eb3ff" }}>
              {aiStatus.provider || "none yet"}
            </span>
            {aiStatus.detail && <span className="block text-neutral-600 mt-0.5">({aiStatus.detail})</span>}
          </p>
          <p className="text-xs text-neutral-500">
            This device: <span style={{ color: "#5eb3ff" }}>{readOnly ? "PC (view only)" : "Phone (editing)"}</span>
          </p>
          {!readOnly && (
            <>
              <button
                onClick={() => persistOnboarded(false)}
                className="w-full border border-neutral-600 rounded-lg py-2 text-xs text-neutral-400"
              >
                Recalibrate starting stats
              </button>
              <button
                onClick={() => {
                  if (confirmReset) {
                    resetAllData();
                  } else {
                    setConfirmReset(true);
                    setTimeout(() => setConfirmReset(false), 4000);
                  }
                }}
                className={`w-full border rounded-lg py-2 text-xs ${
                  confirmReset ? "border-red-500 text-red-500" : "border-neutral-600 text-neutral-400"
                }`}
              >
                {confirmReset ? "Tap again to permanently erase all data" : "Reset all data"}
              </button>
            </>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full border border-neutral-600 rounded-lg py-2 text-xs text-neutral-400 flex items-center justify-center gap-1.5"
            >
              <LogOut size={12} /> Sign out
            </button>
          )}
        </div>
      )}

      {tab !== "workouts" && (
        <div className="flex border-b border-neutral-700 bg-neutral-800 sticky top-0 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "workouts" && tab !== "workouts") setPreWorkoutsTab(tab);
                  setTab(t.id);
                }}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium border-b-2 transition-colors shrink-0 min-w-[64px] ${
                  active ? "border-violet-500 text-neutral-100" : "border-transparent text-neutral-500 hover:text-neutral-400"
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-4">
        {tab === "today" && (
          <TodayView
            tasks={todayTasks}
            allTasks={tasks}
            setTasks={persistTasks}
            habitsToday={habitsToday}
            allHabits={habits}
            setHabits={persistHabits}
            stats={stats}
            setStats={persistStats}
            skills={skills}
            setSkills={persistSkills}
            pct={todayPct}
            done={doneCount}
            total={totalCount}
            apiKey={apiKey}
            geminiKey={geminiKey}
            readOnly={readOnly}
          />
        )}
        {tab === "goals" && <GoalsView goals={goals} setGoals={persistGoals} exercises={exercises} workoutLogs={workoutLogs} readOnly={readOnly} />}
        {tab === "habits" && (
          <HabitsView habits={habits} setHabits={persistHabits} skills={skills} apiKey={apiKey} geminiKey={geminiKey} readOnly={readOnly} />
        )}
        {tab === "vices" && (
          <VicesView
            vices={vices}
            setVices={persistVices}
            stats={stats}
            setStats={persistStats}
            apiKey={apiKey}
            geminiKey={geminiKey}
            readOnly={readOnly}
          />
        )}
        {tab === "skills" && (
          <SkillsView
            skills={skills}
            setSkills={persistSkills}
            stats={stats}
            overall={overall}
            snapshots={snapshots}
            setSnapshots={persistSnapshots}
            apiKey={apiKey}
            geminiKey={geminiKey}
            readOnly={readOnly}
          />
        )}
        {tab === "workouts" && (
          <button
            onClick={() => setTab(preWorkoutsTab)}
            className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200 mb-3 -mt-1"
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
        {tab === "workouts" && (
          <WorkoutsView
            exercises={exercises}
            setExercises={persistExercises}
            categories={workoutCategories}
            setCategories={persistWorkoutCategories}
            workoutLogs={workoutLogs}
            setWorkoutLogs={persistWorkoutLogs}
            readOnly={readOnly}
          />
        )}
        {tab === "week" && <WeekView tasks={tasks} habits={habits} />}
      </div>
    </div>
  );
}

// ---------- Stats (Today tab, top section) ----------

function CircularStat({ level, xpPct, xpText, label, sublabel, ringColor = "stroke-violet-500", onAdjust, onRemove }) {
  const r = 30;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.max(0, Math.min(100, xpPct)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        {onRemove && (
          <button
            onClick={onRemove}
            className="absolute -top-1 -right-1 z-10 w-4 h-4 rounded-full bg-neutral-800 border border-neutral-600 flex items-center justify-center text-neutral-500 hover:text-red-500"
          >
            <X size={9} />
          </button>
        )}
        <svg viewBox="0 0 72 72" className="w-20 h-20 -rotate-90">
          <circle cx="36" cy="36" r={r} strokeWidth="5" className="stroke-neutral-700" fill="none" />
          <circle
            cx="36"
            cy="36"
            r={r}
            strokeWidth="5"
            className={`${ringColor} transition-all duration-500`}
            fill="none"
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-neutral-100">{level}</span>
          {xpText && <span className="text-[9px] text-neutral-500">{xpText}</span>}
        </div>
      </div>
      <span className="text-[10px] text-neutral-400 text-center leading-tight w-20 truncate">{label}</span>
      {sublabel && <span className="text-[9px] text-neutral-500">{sublabel}</span>}
      {onAdjust && (
        <div className="flex gap-1">
          <button
            onClick={() => onAdjust(-1)}
            className="w-4.5 h-4.5 rounded-full border border-neutral-600 flex items-center justify-center text-neutral-500 hover:bg-neutral-700"
          >
            <Minus size={9} />
          </button>
          <button
            onClick={() => onAdjust(1)}
            className="w-4.5 h-4.5 rounded-full border border-neutral-600 flex items-center justify-center text-neutral-500 hover:bg-neutral-700"
          >
            <Plus size={9} />
          </button>
        </div>
      )}
    </div>
  );
}

function StatsSection({ stats, setStats, adjustStat }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  const mainStats = stats.filter((s) => s.isMain);
  const customStats = stats.filter((s) => !s.isMain);

  const addStat = () => {
    if (!name.trim()) return;
    setStats([...stats, { id: uid(), name: name.trim(), level: 1, xp: 0, isMain: false }]);
    setName("");
    setShowForm(false);
  };
  const removeStat = (id) => setStats(stats.filter((s) => s.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Stats</p>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1">
          <Plus size={12} /> Add stat
        </button>
      </div>

      {showForm && (
        <div className="flex gap-2 mb-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addStat()}
            placeholder="Custom stat name"
            className="flex-1 border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />
          <button onClick={addStat} className="bg-violet-600 text-white rounded-lg px-3 py-2 text-sm">
            Add
          </button>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-4 gap-y-3 justify-items-center">
          {mainStats.map((s) => (
            <CircularStat
              key={s.id}
              level={s.level}
              xpPct={(s.xp / xpThreshold(s.level)) * 100}
              xpText={`${Math.round(s.xp)}/${xpThreshold(s.level)}`}
              label={s.name}
            />
          ))}
        </div>
      </Card>

      {customStats.length > 0 && (
        <Card className="mt-2">
          <div className="grid grid-cols-4 gap-y-3 justify-items-center">
            {customStats.map((s) => (
              <CircularStat
                key={s.id}
                level={s.level}
                xpPct={(s.xp / xpThreshold(s.level)) * 100}
                xpText={`${Math.round(s.xp)}/${xpThreshold(s.level)}`}
                label={s.name}
                onRemove={() => removeStat(s.id)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- Today ----------

// Live countdown to local midnight — shown next to a habit that's due today, not yet
// completed, and has an active streak, since that's the only case where "nothing
// happens" is actually false: missing it resets the streak the moment the date rolls
// over. Ticks every second; format shortens to just minutes/seconds under an hour left
// so it reads as urgent right when it should.
function MidnightCountdown() {
  const msToMidnight = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return midnight - now;
  };
  const [ms, setMs] = useState(msToMidnight);

  useEffect(() => {
    const id = setInterval(() => setMs(msToMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const urgent = hours < 1;
  const label =
    hours > 0
      ? `${hours}h ${minutes}m left`
      : `${minutes}m ${seconds.toString().padStart(2, "0")}s left`;

  return (
    <span className={`flex items-center gap-1 text-xs font-medium sys-display ${urgent ? "text-red-500" : "text-neutral-500"}`}>
      <Clock size={11} />
      {label}
    </span>
  );
}

function TodayView({
  tasks,
  allTasks,
  setTasks,
  habitsToday,
  allHabits,
  setHabits,
  stats,
  setStats,
  skills,
  setSkills,
  pct,
  done,
  total,
  apiKey,
  geminiKey,
  readOnly,
}) {
  const [title, setTitle] = useState("");
  const today = todayStr();

  const classifyTaskSkill = async (taskId, taskTitle) => {
    if (skills.length === 0) return;

    const applyLinks = (links) => {
      if (!links.length) return;
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, skillLinks: links } : t)));
    };

    try {
      const optionsList = skills.map((s) => `${s.id}: ${s.name}`).join("\n");
      const prompt = `Classify this task into skill categories for a gamified task tracker. Pick every skill that genuinely fits (usually 1, sometimes 2-3), each with a weight (percent) so all picked weights sum to exactly 100.

Available skills:
${optionsList}

Task: "${taskTitle}"

Respond with ONLY raw JSON, no markdown, in exactly this shape:
{"skillLinks": [{"skillId": "<id>", "weight": <int>}, ...]}
Return an empty array if genuinely nothing fits.`;
      const text = await callClaudeAI(prompt, 300, { apiKey, geminiKey });
      const parsed = extractJSON(text);
      const valid = (parsed.skillLinks || []).filter((l) => l.skillId && skills.some((s) => s.id === l.skillId));
      if (valid.length) {
        applyLinks(valid);
      } else {
        applyLinks(heuristicClassify(skills, taskTitle));
      }
    } catch (e) {
      console.error("AI task classify failed, using local fallback:", e);
      setAIStatus("Local heuristic (no AI)", e.message);
      applyLinks(heuristicClassify(skills, taskTitle));
    }
  };

  const addTask = () => {
    if (!title.trim()) return;
    const newTask = {
      id: uid(),
      title: title.trim(),
      date: today,
      completed: false,
      difficulty: "normal",
      intensity: "moderate",
      duration: null,
      skillLinks: [],
    };
    const next = [...allTasks, newTask];
    setTasks(next);
    setTitle("");
    classifyTaskSkill(newTask.id, newTask.title);
  };

  const updateTask = (id, patch) => setTasks(allTasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeTask = (id) => setTasks(allTasks.filter((t) => t.id !== id));

  const toggleTask = (id) => {
    const task = allTasks.find((t) => t.id === id);
    if (!task) return;

    if (task.completed) {
      // revert exactly what completing it granted
      const receipt = task.xpReceipt;
      if (receipt) {
        const reverted = revertSkillXp(receipt, { skills, stats });
        setSkills(reverted.skills);
        setStats(reverted.stats);
      }
      setTasks(allTasks.map((t) => (t.id === id ? { ...t, completed: false, xpReceipt: undefined } : t)));
      return;
    }

    const normalizedTitle = task.title.trim().toLowerCase();
    const priorCompletionsToday = allTasks.filter(
      (t) => t.id !== id && t.completed && t.date === today && t.title.trim().toLowerCase() === normalizedTitle
    ).length;
    const rawXp = computeTaskRawXp(task) * repetitionMultiplier(priorCompletionsToday);

    const links = task.skillLinks || [];
    const weightSum = links.reduce((a, l) => a + l.weight, 0) || 1;
    const entries = links.map((l) => ({ skillId: l.skillId, rawAmount: (rawXp * l.weight) / weightSum }));
    const result = entries.length
      ? grantSkillXp(entries, { skills, stats })
      : { skills, stats, awardedSkills: [], awardedStats: [], totalXp: 0 };

    setSkills(result.skills);
    setStats(result.stats);
    setTasks(
      allTasks.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: true,
              xpReceipt: { awardedSkills: result.awardedSkills, awardedStats: result.awardedStats, totalXp: result.totalXp },
            }
          : t
      )
    );
  };

  const toggleHabit = (id) => {
    const habit = allHabits.find((h) => h.id === id);
    if (!habit) return;
    const wasDone = !!habit.completions[today];

    if (wasDone) {
      const receipt = habit.completions[today];
      const completions = { ...habit.completions };
      delete completions[today];
      setHabits(allHabits.map((h) => (h.id === id ? { ...h, completions } : h)));
      if (receipt && typeof receipt === "object") {
        const reverted = revertSkillXp(receipt, { skills, stats });
        setSkills(reverted.skills);
        setStats(reverted.stats);
      }
      return;
    }

    const links = habit.skillLinks || [];
    const totalXp = habit.xpPerCompletion || 0;
    const provisional = { ...habit, completions: { ...habit.completions, [today]: true } };
    const streakDays = streakOf(provisional);
    const entries = links.map((l) => ({ skillId: l.skillId, rawAmount: (totalXp * l.weight) / 100 }));
    const result = entries.length
      ? grantSkillXp(entries, { skills, stats, disciplineStreakDays: streakDays })
      : { skills, stats, awardedSkills: [], awardedStats: [], totalXp: 0 };

    setSkills(result.skills);
    setStats(result.stats);
    const completions = {
      ...habit.completions,
      [today]: { awardedSkills: result.awardedSkills, awardedStats: result.awardedStats, totalXp: result.totalXp },
    };
    setHabits(allHabits.map((h) => (h.id === id ? { ...h, completions } : h)));
  };

  const adjustStat = (id, delta) => setStats(stats.map((s) => (s.id === id ? addXp(s, delta) : s)));

  return (
    <div className="space-y-4">
      <StatsSection stats={stats} setStats={setStats} adjustStat={adjustStat} />

      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-neutral-300">Today's progress</span>
          <span className="text-sm font-semibold text-neutral-100">{total ? `${done}/${total}` : "Nothing planned"}</span>
        </div>
        <Bar pct={pct} />
        <p className="text-2xl font-semibold text-neutral-100 mt-2">{Math.round(pct)}%</p>
      </Card>

      {habitsToday.length > 0 && (
        <div>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 px-1">Habits</p>
          <div className="space-y-2">
            {habitsToday.map((h) => {
              const doneH = !!h.completions[today];
              const s = streakOf(h);
              return (
                <div key={h.id} className="flex items-center gap-3 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5">
                  <button
                    onClick={() => !readOnly && toggleHabit(h.id)}
                    disabled={readOnly}
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                      doneH ? "bg-orange-500 border-orange-500" : "border-neutral-600"
                    }`}
                  >
                    {doneH && <Check size={12} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${doneH ? "line-through text-neutral-500" : "text-neutral-200"}`}>{h.name}</p>
                    {h.description && <p className="text-xs text-neutral-500 truncate">{h.description}</p>}
                  </div>
                  {h.freqType === "flexible" && (
                    <span className="text-xs text-neutral-500">
                      {weeklyCount(h)}/{h.target} this wk
                    </span>
                  )}
                  {!doneH && habitNeedsToday(h) && <MidnightCountdown />}
                  {s > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-orange-500 font-medium">
                      <Flame size={12} /> {s}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 px-1">Tasks</p>
        {!readOnly && (
          <div className="flex gap-2 mb-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Add a one-off task for today"
              className="flex-1 border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
            />
            <button onClick={addTask} className="bg-violet-600 text-white rounded-lg px-3 py-2">
              <Plus size={16} />
            </button>
          </div>
        )}
        <div className="space-y-2">
          {tasks.length === 0 && habitsToday.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-6">Nothing planned yet. Add a task, or set up habits under the Habits tab.</p>
          )}
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              skills={skills}
              readOnly={readOnly}
              onToggle={() => toggleTask(t.id)}
              onRemove={() => removeTask(t.id)}
              onUpdate={(patch) => updateTask(t.id, patch)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Task row (with inline expand for duration/difficulty/intensity/skills) ----------

function TaskRow({ task, skills, onToggle, onRemove, onUpdate, readOnly }) {
  const [expanded, setExpanded] = useState(false);

  const toggleLink = (skillId) => {
    const links = task.skillLinks || [];
    const exists = links.some((l) => l.skillId === skillId);
    const nextLinks = exists ? links.filter((l) => l.skillId !== skillId) : [...links, { skillId, weight: 100 }];
    onUpdate({ skillLinks: nextLinks });
  };
  const setLinkWeight = (skillId, weight) => {
    const links = (task.skillLinks || []).map((l) => (l.skillId === skillId ? { ...l, weight } : l));
    onUpdate({ skillLinks: links });
  };
  const linkWeightSum = (task.skillLinks || []).reduce((a, l) => a + l.weight, 0);
  const estXp = Math.round(computeTaskRawXp(task));

  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={() => !readOnly && onToggle()}
          disabled={readOnly}
          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
            task.completed ? "bg-emerald-500 border-emerald-500" : "border-neutral-600"
          }`}
        >
          {task.completed && <Check size={12} className="text-white" />}
        </button>
        <span className={`flex-1 text-sm ${task.completed ? "line-through text-neutral-500" : "text-neutral-200"}`}>{task.title}</span>
        {task.completed && task.xpReceipt && <span className="text-xs text-violet-600 font-medium">+{Math.round(task.xpReceipt.totalXp)} XP</span>}
        {!readOnly && (
          <>
            <button onClick={() => setExpanded((v) => !v)} className="text-neutral-600 hover:text-neutral-400">
              <Pencil size={13} />
            </button>
            <button onClick={onRemove} className="text-neutral-600 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {expanded && !readOnly && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-neutral-700">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 w-16 shrink-0">Duration</span>
            <input
              type="number"
              value={task.duration ?? ""}
              onChange={(e) => onUpdate({ duration: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="minutes (optional)"
              className="flex-1 border border-neutral-600 rounded-lg px-2 py-1.5 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <span className="text-xs text-neutral-400 mb-1 block">Difficulty</span>
            <div className="flex gap-1.5">
              {Object.keys(DIFFICULTY_MULT).map((d) => (
                <button
                  key={d}
                  onClick={() => onUpdate({ difficulty: d })}
                  className={`flex-1 text-xs py-1.5 rounded-lg border ${
                    (task.difficulty || "normal") === d ? "bg-violet-600 text-white border-violet-500" : "border-neutral-600 text-neutral-400"
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-neutral-400 mb-1 block">Intensity</span>
            <div className="flex gap-1.5">
              {Object.keys(INTENSITY_MULT).map((i) => (
                <button
                  key={i}
                  onClick={() => onUpdate({ intensity: i })}
                  className={`flex-1 text-xs py-1.5 rounded-lg border ${
                    (task.intensity || "moderate") === i ? "bg-violet-600 text-white border-violet-500" : "border-neutral-600 text-neutral-400"
                  }`}
                >
                  {INTENSITY_LABELS[i]}
                </button>
              ))}
            </div>
          </div>

          {skills.length > 0 && (
            <div>
              <span className="text-xs text-neutral-400 mb-1 block">Skills (auto-detected — edit if needed)</span>
              <div className="space-y-1">
                {skills.map((s) => {
                  const link = (task.skillLinks || []).find((l) => l.skillId === s.id);
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleLink(s.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          link ? "bg-violet-500 border-violet-500" : "border-neutral-600"
                        }`}
                      >
                        {link && <Check size={10} className="text-white" />}
                      </button>
                      <span className="text-xs text-neutral-300 flex-1">{s.name}</span>
                      {link && (
                        <input
                          type="number"
                          value={link.weight}
                          onChange={(e) => setLinkWeight(s.id, parseInt(e.target.value) || 0)}
                          className="w-14 border border-neutral-600 rounded-lg px-1.5 py-1 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
                          placeholder="%"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {(task.skillLinks || []).length > 0 && linkWeightSum !== 100 && (
                <p className="text-xs text-amber-600 mt-1">Weights sum to {linkWeightSum}% — normalized to 100% when this task is completed.</p>
              )}
            </div>
          )}

          <p className="text-xs text-neutral-500 flex items-center gap-1">
            <Sparkles size={11} /> ≈ {estXp} XP {task.completed && "(already awarded, editing won't change it)"}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Goals ----------

function GoalsView({ goals, setGoals, exercises, workoutLogs, readOnly }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "", start: "", target: "", exerciseId: "" });

  const pbFor = (exerciseId) => {
    let best = null;
    workoutLogs
      .filter((l) => l.exerciseId === exerciseId)
      .forEach((l) =>
        l.sets.forEach((s) => {
          if (best === null || s.weight > best) best = s.weight;
        })
      );
    return best;
  };

  const addGoal = () => {
    if (!form.name.trim() || form.target === "") return;
    const start = parseFloat(form.start) || 0;
    const target = parseFloat(form.target);
    const goal = { id: uid(), name: form.name.trim(), unit: form.unit.trim(), start, current: start, target };
    if (form.exerciseId) goal.exerciseId = form.exerciseId;
    setGoals([...goals, goal]);
    setForm({ name: "", unit: "", start: "", target: "", exerciseId: "" });
    setShowForm(false);
  };
  const updateCurrent = (id, value) => {
    const v = parseFloat(value);
    setGoals(goals.map((g) => (g.id === id ? { ...g, current: isNaN(v) ? g.current : v } : g)));
  };
  const remove = (id) => setGoals(goals.filter((g) => g.id !== id));

  return (
    <div className="space-y-3">
      {goals.length === 0 && !showForm && (
        <p className="text-sm text-neutral-500 text-center py-6">No goals yet. Add something you're working toward.</p>
      )}
      {goals.map((g) => {
        const exercise = g.exerciseId ? exercises.find((e) => e.id === g.exerciseId) : null;
        const pb = exercise ? pbFor(g.exerciseId) : null;
        const current = exercise && pb !== null ? pb : g.current;
        const range = g.target - g.start;
        const pct = range !== 0 ? ((current - g.start) / range) * 100 : 0;
        return (
          <Card key={g.id}>
            <div className="flex items-start justify-between mb-1.5">
              <span className="text-sm font-medium text-neutral-200">{g.name}</span>
              {!readOnly && (
                <button onClick={() => remove(g.id)} className="text-neutral-600 hover:text-red-500">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-neutral-400">
                {current}
                {g.unit} / {g.target}
                {g.unit}
              </span>
              <span className="text-xs font-medium text-neutral-500">{Math.round(Math.max(0, Math.min(100, pct)))}%</span>
            </div>
            <Bar pct={pct} colorClass="bg-blue-500" />
            {exercise ? (
              <p className="text-xs text-violet-600 mt-2 flex items-center gap-1">
                <Dumbbell size={11} /> Auto-synced from Workouts · {exercise.name}
                {pb === null && " (no sets logged yet)"}
              </p>
            ) : readOnly ? (
              <p className="text-xs text-neutral-500 mt-2">
                {current}
                {g.unit}
              </p>
            ) : (
              <input
                type="number"
                defaultValue={g.current}
                onBlur={(e) => updateCurrent(g.id, e.target.value)}
                className="mt-2 w-28 border border-neutral-600 rounded-lg px-2 py-1 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
                placeholder="update value"
              />
            )}
          </Card>
        );
      })}

      {readOnly ? null : showForm ? (
        <Card className="space-y-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Goal name (e.g. Bench press)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />
          <input
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="Unit (kg, km, hrs)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
              placeholder="Start value"
              type="number"
              className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
            />
            <input
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="Target value"
              type="number"
              className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
            />
          </div>
          {exercises.length > 0 && (
            <div>
              <p className="text-xs font-medium text-neutral-400 mb-1.5">Auto-sync from a workout exercise (optional)</p>
              <select
                value={form.exerciseId}
                onChange={(e) => setForm({ ...form, exerciseId: e.target.value })}
                className="w-full border border-neutral-600 rounded-lg px-2 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
              >
                <option value="">None — update manually</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} (uses heaviest weight logged)
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={addGoal} className="bg-violet-600 text-white rounded-lg px-3 py-2 text-sm flex-1">
              Add goal
            </button>
            <button onClick={() => setShowForm(false)} className="border border-neutral-600 rounded-lg px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400 flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add goal
        </button>
      )}
    </div>
  );
}

// ---------- Habits ----------

function HabitsView({ habits, setHabits, skills, apiKey, geminiKey, readOnly }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [freqType, setFreqType] = useState("daily");
  const [days, setDays] = useState([]);
  const [target, setTarget] = useState(3);
  const [links, setLinks] = useState({}); // { [skillId]: weight% }
  const [xpPerCompletion, setXpPerCompletion] = useState(100);
  const [aiPicked, setAiPicked] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(false);

  const toggleDay = (i) => setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const toggleLink = (skillId) => {
    setLinks((prev) => {
      const next = { ...prev };
      if (skillId in next) delete next[skillId];
      else next[skillId] = 100;
      return next;
    });
    setAiPicked(false);
  };
  const setLinkWeight = (skillId, weight) => {
    setLinks((prev) => ({ ...prev, [skillId]: weight }));
    setAiPicked(false);
  };
  const linkWeightSum = Object.values(links).reduce((a, b) => a + b, 0);

  const classifySkills = async (habitName, habitDesc) => {
    const optionsList = skills.map((s) => `${s.id}: ${s.name}`).join("\n");
    const prompt = `You classify personal habits into skill categories for a gamified habit tracker. A habit can reasonably contribute to more than one skill (e.g. "Build a website" mainly builds Programming but also some Design).

Available skills (pick every skill that genuinely fits, by id — usually 1-2, rarely more):
${optionsList}

Habit name: "${habitName}"
Habit description: "${habitDesc || "(none given)"}"

For the skills you pick, assign each a weight (percent) representing its share of this habit — the weights across all picked skills must sum to exactly 100.

Also judge a total xpPerCompletion for the whole habit based on the actual effort/duration/quantity implied by the name and description — a 10km run should be worth roughly double a 5km run, a 45 minute session more than a 10 minute one. Rough scale: light/short effort ~60-120xp, moderate ~120-300xp, intense or long effort ~300-800xp.

Respond with ONLY raw JSON, no markdown formatting, no code fences, in exactly this shape:
{"skillLinks": [{"skillId": "<id>", "weight": <int, sums to 100 across all entries>}, ...], "xpPerCompletion": <integer>}
Return an empty skillLinks array if genuinely nothing fits.`;

    const text = await callClaudeAI(prompt, 400, { apiKey, geminiKey });
    return extractJSON(text);
  };

  const handleSuggest = async () => {
    if (!name.trim() || skills.length === 0) return;
    setSuggesting(true);
    setSuggestError(false);
    try {
      const result = await classifySkills(name, description);
      const valid = (result.skillLinks || []).filter((r) => r.skillId && skills.some((s) => s.id === r.skillId));
      if (valid.length) {
        const next = {};
        valid.forEach((r) => {
          next[r.skillId] = Math.max(1, parseInt(r.weight) || 0);
        });
        setLinks(next);
        setXpPerCompletion(Math.max(1, parseInt(result.xpPerCompletion) || 100));
        setAiPicked(true);
      } else {
        setLinks({});
        setAiPicked(false);
      }
    } catch (e) {
      console.error("AI habit classify failed, using local fallback:", e);
      setAIStatus("Local heuristic (no AI)", e.message);
      const fallback = heuristicClassify(skills, `${name} ${description}`);
      if (fallback.length) {
        const next = {};
        fallback.forEach((r) => {
          next[r.skillId] = Math.max(1, r.weight);
        });
        setLinks(next);
        setAiPicked(true);
        setSuggestError(false);
      } else {
        setSuggestError(true);
      }
    } finally {
      setSuggesting(false);
    }
  };

  const addHabit = () => {
    if (!name.trim()) return;
    const habit = { id: uid(), name: name.trim(), description: description.trim(), freqType, completions: {} };
    if (freqType === "days") habit.days = days;
    if (freqType === "flexible") habit.target = target;
    const entries = Object.entries(links);
    if (entries.length) {
      const sum = entries.reduce((a, [, w]) => a + w, 0) || 1;
      habit.skillLinks = entries.map(([skillId, w]) => ({ skillId, weight: Math.round((w / sum) * 100) }));
      habit.xpPerCompletion = xpPerCompletion;
    }
    setHabits([...habits, habit]);
    setName("");
    setDescription("");
    setFreqType("daily");
    setDays([]);
    setTarget(3);
    setLinks({});
    setXpPerCompletion(50);
    setAiPicked(false);
    setSuggestError(false);
    setShowForm(false);
  };
  const remove = (id) => setHabits(habits.filter((h) => h.id !== id));

  const scheduleLabel = (h) => {
    if (h.freqType === "daily") return "Every day";
    if (h.freqType === "days") return (h.days || []).map((d) => WEEKDAYS[d]).join(" ") || "No days set";
    if (h.freqType === "flexible") return `${h.target}x per week`;
    return "";
  };

  return (
    <div className="space-y-3">
      {readOnly ? null : showForm ? (
        <Card className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Habit name (e.g. Gym, Read)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (Object.keys(links).length === 0 && name.trim()) handleSuggest();
            }}
            placeholder="Description (e.g. 45 min upper body, home gym)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />
          <div>
            <p className="text-xs font-medium text-neutral-400 mb-1.5">When is it due?</p>
            <div className="flex gap-1.5">
              {[
                { id: "daily", label: "Every day" },
                { id: "days", label: "Specific days" },
                { id: "flexible", label: "X per week" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFreqType(opt.id)}
                  className={`flex-1 text-xs py-2 rounded-lg border ${
                    freqType === opt.id ? "bg-violet-600 text-white border-violet-500" : "border-neutral-600 text-neutral-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {freqType === "days" && (
            <div className="flex gap-1.5">
              {WEEKDAYS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`flex-1 text-xs py-2 rounded-lg border ${
                    days.includes(i) ? "bg-orange-500 text-white border-orange-500" : "border-neutral-600 text-neutral-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {freqType === "flexible" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">Times per week</span>
              <input
                type="number"
                min="1"
                max="7"
                value={target}
                onChange={(e) => setTarget(parseInt(e.target.value) || 1)}
                className="w-16 border border-neutral-600 rounded-lg px-2 py-1.5 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
              />
            </div>
          )}

          {skills.length === 0 ? (
            <p className="text-xs text-neutral-500">No skills yet — create one under the Skills tab to link XP from this habit.</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-neutral-400">Link to skills (optional, pick as many as fit)</p>
                <button
                  onClick={handleSuggest}
                  disabled={!name.trim() || suggesting}
                  className="text-xs text-violet-600 hover:text-violet-800 disabled:text-neutral-600 flex items-center gap-1"
                >
                  <Sparkles size={11} />
                  {suggesting ? "Thinking..." : "Auto-detect"}
                </button>
              </div>
              <div className="space-y-1.5">
                {skills.map((s) => {
                  const checked = s.id in links;
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleLink(s.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          checked ? "bg-violet-500 border-violet-500" : "border-neutral-600"
                        }`}
                      >
                        {checked && <Check size={10} className="text-white" />}
                      </button>
                      <span className="text-sm text-neutral-300 flex-1">{s.name}</span>
                      {checked && (
                        <input
                          type="number"
                          value={links[s.id]}
                          onChange={(e) => setLinkWeight(s.id, parseInt(e.target.value) || 0)}
                          className="w-16 border border-neutral-600 rounded-lg px-2 py-1 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
                          placeholder="weight %"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {Object.keys(links).length > 0 && (
                <p className={`text-xs mt-1.5 ${linkWeightSum === 100 ? "text-neutral-500" : "text-amber-600"}`}>
                  Total weight: {linkWeightSum}% {linkWeightSum !== 100 && "— will be normalized to 100% on save"}
                </p>
              )}
              {Object.keys(links).length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-neutral-400">XP per completion</span>
                  <input
                    type="number"
                    value={xpPerCompletion}
                    onChange={(e) => {
                      setXpPerCompletion(parseInt(e.target.value) || 1);
                      setAiPicked(false);
                    }}
                    className="w-20 border border-neutral-600 rounded-lg px-2 py-1 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
                  />
                </div>
              )}
              {aiPicked && Object.keys(links).length > 0 && (
                <p className="text-xs text-violet-600 mt-1.5 flex items-center gap-1">
                  <Sparkles size={10} /> Claude suggested this — feel free to change it
                </p>
              )}
              {suggestError && <p className="text-xs text-red-500 mt-1.5">Couldn't get a suggestion, pick manually instead.</p>}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={addHabit} className="bg-violet-600 text-white rounded-lg px-3 py-2 text-sm flex-1">
              Add habit
            </button>
            <button onClick={() => setShowForm(false)} className="border border-neutral-600 rounded-lg px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400 flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add habit
        </button>
      )}

      {habits.length === 0 && !showForm && (
        <p className="text-sm text-neutral-500 text-center py-6">No habits yet. Add one and set when it's due — it'll show up in Today automatically.</p>
      )}
      {habits.map((h) => {
        const days7 = last7();
        const s = streakOf(h);
        return (
          <Card key={h.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-neutral-200">{h.name}</span>
              <div className="flex items-center gap-3">
                {s > 0 && (
                  <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                    <Flame size={13} /> {s}
                  </span>
                )}
                {!readOnly && (
                  <button onClick={() => remove(h.id)} className="text-neutral-600 hover:text-red-500">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-neutral-500 mb-2">{scheduleLabel(h)}</p>
            {h.description && <p className="text-xs text-neutral-400 mb-2">{h.description}</p>}
            {(h.skillLinks || []).length > 0 && (
              <p className="text-xs text-neutral-400 mb-2 flex items-center gap-1 flex-wrap">
                <Sparkles size={11} />
                {h.xpPerCompletion} XP ·{" "}
                {h.skillLinks
                  .map((l) => {
                    const skill = skills.find((s2) => s2.id === l.skillId);
                    return skill ? `${l.weight}% ${skill.name}` : null;
                  })
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <div className="flex gap-1.5 items-center">
              {days7.map((d) => {
                const doneD = !!h.completions[d];
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1 py-1">
                    <span className="text-[10px] text-neutral-500">{dayLabel(d)}</span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${doneD ? "bg-orange-500" : "bg-neutral-700"}`}>
                      {doneD && <Check size={10} className="text-white" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Vices ----------
// Mirrors HabitsView's add-flow (AI-assisted classification, manual override), but a
// Vice links straight to Stats instead of Skills — there's no skill to level down when
// you eat junk food, it should just hit Vitality directly. Logging one debuffs the
// linked stats immediately via applyViceLog — the same vice can be logged multiple
// times in a day, each tap its own hit, undoable one tap at a time via revertViceLog.
function VicesView({ vices, setVices, stats, setStats, apiKey, geminiKey, readOnly }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [affinities, setAffinities] = useState({}); // { [statId]: weight }
  const [xpPerLog, setXpPerLog] = useState(100);
  const [aiPicked, setAiPicked] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  const today = todayStr();

  const toggleAffinity = (statId) => {
    setAffinities((prev) => {
      const next = { ...prev };
      if (statId in next) delete next[statId];
      else next[statId] = 100;
      return next;
    });
    setAiPicked(false);
  };
  const setAffinityWeight = (statId, w) => {
    setAffinities((prev) => ({ ...prev, [statId]: w }));
    setAiPicked(false);
  };
  const affinitySum = Object.values(affinities).reduce((a, b) => a + b, 0);

  const classifyVice = async (viceName) => {
    const optionsList = stats.map((s) => `${s.id}: ${s.name}`).join("\n");
    const prompt = `You classify a bad habit ("vice") in a gamified personal-progress tracker by which core stats it should DEBUFF (hurt) if someone does it. A vice can reasonably hurt more than one stat (e.g. "Binge drinking" mainly hurts Discipline but also some Stamina).

Available stats (pick every stat that genuinely fits, by id — usually 1-2, rarely more):
${optionsList}

Vice name: "${viceName}"

For the stats you pick, assign each a weight (percent) representing its share of the damage — the weights across all picked stats must sum to exactly 100.

Also judge a total xpPerLog for the whole vice based on how damaging it realistically is — a minor slip (sleeping in once) should be worth much less than something with lasting impact (a night of heavy drinking). Rough scale: minor ~40-100xp, moderate ~100-250xp, severe ~250-600xp.

Respond with ONLY raw JSON, no markdown formatting, no code fences, in exactly this shape:
{"statAffinities": [{"statId": "<id>", "weight": <int, sums to 100 across all entries>}, ...], "xpPerLog": <integer>}
Return an empty statAffinities array if genuinely nothing fits.`;

    const text = await callClaudeAI(prompt, 300, { apiKey, geminiKey });
    return extractJSON(text);
  };

  const handleSuggest = async () => {
    if (!name.trim() || stats.length === 0) return;
    setSuggesting(true);
    setSuggestError(false);
    try {
      const result = await classifyVice(name);
      const valid = (result.statAffinities || []).filter((r) => r.statId && stats.some((s) => s.id === r.statId));
      if (valid.length) {
        const next = {};
        valid.forEach((r) => {
          next[r.statId] = Math.max(1, parseInt(r.weight) || 0);
        });
        setAffinities(next);
        setXpPerLog(Math.max(1, parseInt(result.xpPerLog) || 100));
        setAiPicked(true);
      } else {
        setAffinities({});
        setAiPicked(false);
      }
    } catch (e) {
      console.error("AI vice classify failed, using local fallback:", e);
      setAIStatus("Local heuristic (no AI)", e.message);
      const fallback = heuristicStatAffinity(stats, name);
      if (fallback.length) {
        const next = {};
        fallback.forEach((r) => {
          next[r.statId] = Math.max(1, r.weight);
        });
        setAffinities(next);
        setAiPicked(true);
        setSuggestError(false);
      } else {
        setSuggestError(true);
      }
    } finally {
      setSuggesting(false);
    }
  };

  const addVice = () => {
    if (!name.trim()) return;
    const entries = Object.entries(affinities);
    let statAffinities = [];
    if (entries.length) {
      const sum = entries.reduce((a, [, w]) => a + w, 0) || 1;
      statAffinities = entries.map(([statId, w]) => ({ statId, weight: Math.round((w / sum) * 100) }));
    }
    setVices([...vices, { id: uid(), name: name.trim(), statAffinities, xpPerLog, log: {} }]);
    setName("");
    setAffinities({});
    setXpPerLog(100);
    setAiPicked(false);
    setSuggestError(false);
    setShowForm(false);
  };
  const remove = (id) => setVices(vices.filter((v) => v.id !== id));

  const addPreset = (preset) => {
    const statAffinities = preset.stats.map(([statName, weight]) => ({ statId: mainStatId(statName), weight }));
    setVices([...vices, { id: uid(), name: preset.name, statAffinities, xpPerLog: preset.xp, log: {} }]);
  };
  const existingNames = new Set(vices.map((v) => v.name.trim().toLowerCase()));
  const availablePresets = PRESET_VICES.filter((p) => !existingNames.has(p.name.toLowerCase()));

  const logVice = (id) => {
    const vice = vices.find((v) => v.id === id);
    if (!vice) return;
    const result = applyViceLog(vice, stats, today);
    setStats(result.stats);
    setVices(vices.map((v) => (v.id === id ? result.vice : v)));
  };
  const undoLastLog = (id) => {
    const vice = vices.find((v) => v.id === id);
    if (!vice) return;
    const result = revertViceLog(vice, stats, today);
    setStats(result.stats);
    setVices(vices.map((v) => (v.id === id ? result.vice : v)));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500 px-1">
        Logging a vice debuffs its stats immediately. You can log the same one more than once a day — each tap is its own hit.
      </p>

      {!readOnly && availablePresets.length > 0 && (
        <Card className="space-y-2">
          <p className="text-xs font-medium text-neutral-400">Quick add — common vices</p>
          <div className="flex flex-wrap gap-1.5">
            {availablePresets.map((p) => (
              <button
                key={p.name}
                onClick={() => addPreset(p)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-neutral-600 text-neutral-300 hover:border-red-500 hover:text-red-500 flex items-center gap-1"
              >
                <Plus size={10} /> {p.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      {readOnly ? null : showForm ? (
        <Card className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (Object.keys(affinities).length === 0 && name.trim()) handleSuggest();
            }}
            placeholder="Vice name (e.g. Junk food, Drank alcohol)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />

          {stats.length === 0 ? (
            <p className="text-xs text-neutral-500">No stats yet.</p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-neutral-400">Debuffs which stats (pick as many as fit)</p>
                <button
                  onClick={handleSuggest}
                  disabled={!name.trim() || suggesting}
                  className="text-xs text-violet-600 hover:text-violet-800 disabled:text-neutral-600 flex items-center gap-1"
                >
                  <Sparkles size={11} />
                  {suggesting ? "Thinking..." : "Auto-detect"}
                </button>
              </div>
              <div className="space-y-1.5">
                {stats.map((s) => {
                  const checked = s.id in affinities;
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAffinity(s.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          checked ? "bg-red-500 border-red-500" : "border-neutral-600"
                        }`}
                      >
                        {checked && <Check size={10} className="text-white" />}
                      </button>
                      <span className="text-sm text-neutral-300 flex-1">{s.name}</span>
                      {checked && (
                        <input
                          type="number"
                          value={affinities[s.id]}
                          onChange={(e) => setAffinityWeight(s.id, parseInt(e.target.value) || 0)}
                          className="w-16 border border-neutral-600 rounded-lg px-2 py-1 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
                          placeholder="weight %"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {Object.keys(affinities).length > 0 && (
                <p className={`text-xs mt-1.5 ${affinitySum === 100 ? "text-neutral-500" : "text-amber-600"}`}>
                  Total weight: {affinitySum}% {affinitySum !== 100 && "— will be normalized to 100% on save"}
                </p>
              )}
              {Object.keys(affinities).length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-neutral-400">XP debuff per log</span>
                  <input
                    type="number"
                    value={xpPerLog}
                    onChange={(e) => {
                      setXpPerLog(parseInt(e.target.value) || 1);
                      setAiPicked(false);
                    }}
                    className="w-20 border border-neutral-600 rounded-lg px-2 py-1 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
                  />
                </div>
              )}
              {aiPicked && Object.keys(affinities).length > 0 && (
                <p className="text-xs text-violet-600 mt-1.5 flex items-center gap-1">
                  <Sparkles size={10} /> Claude suggested this — feel free to change it
                </p>
              )}
              {suggestError && <p className="text-xs text-red-500 mt-1.5">Couldn't get a suggestion, pick manually instead.</p>}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={addVice} className="bg-red-600 text-white rounded-lg px-3 py-2 text-sm flex-1">
              Add vice
            </button>
            <button onClick={() => setShowForm(false)} className="border border-neutral-600 rounded-lg px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400 flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add vice
        </button>
      )}

      {vices.length === 0 && !showForm && (
        <p className="text-sm text-neutral-500 text-center py-6">No vices tracked yet. Add one and log it whenever it happens.</p>
      )}
      {vices.map((v) => {
        const countToday = (v.log || {})[today] || 0;
        return (
          <Card key={v.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-neutral-200">{v.name}</span>
              {!readOnly && (
                <button onClick={() => remove(v.id)} className="text-neutral-600 hover:text-red-500">
                  <X size={14} />
                </button>
              )}
            </div>
            {(v.statAffinities || []).length > 0 && (
              <p className="text-xs text-neutral-400 mb-2 flex items-center gap-1 flex-wrap">
                <Skull size={11} />
                {v.xpPerLog} XP debuff ·{" "}
                {v.statAffinities
                  .map((a) => {
                    const stat = stats.find((s2) => s2.id === a.statId);
                    return stat ? `${a.weight}% ${stat.name}` : null;
                  })
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => logVice(v.id)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium border ${
                    countToday > 0 ? "bg-red-600 border-red-500 text-white" : "border-neutral-600 text-neutral-400"
                  }`}
                >
                  <Skull size={13} />
                  {countToday > 0 ? `Log again (${countToday}× today)` : "Log"}
                </button>
                {countToday > 0 && (
                  <button
                    onClick={() => undoLastLog(v.id)}
                    className="border border-neutral-600 text-neutral-400 hover:text-red-500 hover:border-red-500 rounded-lg py-2 px-3 text-sm"
                    title="Undo last log"
                  >
                    <Minus size={13} />
                  </button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Skills ----------

function SkillsView({ skills, setSkills, stats, overall, snapshots, setSnapshots, apiKey, geminiKey, readOnly }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [affinities, setAffinities] = useState({}); // { [statId]: weight }
  const [aiPicked, setAiPicked] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(false);

  const toggleAffinity = (statId) => {
    setAffinities((prev) => {
      const next = { ...prev };
      if (statId in next) delete next[statId];
      else next[statId] = 50;
      return next;
    });
    setAiPicked(false);
  };
  const setAffinityWeight = (statId, w) => {
    setAffinities((prev) => ({ ...prev, [statId]: w }));
    setAiPicked(false);
  };
  const affinitySum = Object.values(affinities).reduce((a, b) => a + b, 0);

  const classifyStats = async (skillName) => {
    const optionsList = stats.map((s) => `${s.id}: ${s.name}`).join("\n");
    const prompt = `You assign a new skill in a gamified personal-progress tracker to the core stats it should feed XP into. A skill can reasonably feed more than one stat (e.g. "Rock Climbing" mainly builds Strength but also some Agility).

Available stats (pick every stat that genuinely fits, by id — usually 1-2, rarely more):
${optionsList}

Skill name: "${skillName}"

For the stats you pick, assign each a weight (percent) representing its share — the weights across all picked stats must sum to exactly 100.

Respond with ONLY raw JSON, no markdown formatting, no code fences, in exactly this shape:
{"statAffinities": [{"statId": "<id>", "weight": <int, sums to 100 across all entries>}, ...]}
Return an empty array if genuinely nothing fits.`;

    const text = await callClaudeAI(prompt, 300, { apiKey, geminiKey });
    return extractJSON(text);
  };

  const handleSuggest = async () => {
    if (!name.trim() || stats.length === 0) return;
    setSuggesting(true);
    setSuggestError(false);
    try {
      const result = await classifyStats(name);
      const valid = (result.statAffinities || []).filter((r) => r.statId && stats.some((s) => s.id === r.statId));
      if (valid.length) {
        const next = {};
        valid.forEach((r) => {
          next[r.statId] = Math.max(1, parseInt(r.weight) || 0);
        });
        setAffinities(next);
        setAiPicked(true);
      } else {
        setAffinities({});
        setAiPicked(false);
      }
    } catch (e) {
      console.error("AI stat classify failed, using local fallback:", e);
      setAIStatus("Local heuristic (no AI)", e.message);
      const fallback = heuristicStatAffinity(stats, name);
      if (fallback.length) {
        const next = {};
        fallback.forEach((r) => {
          next[r.statId] = Math.max(1, r.weight);
        });
        setAffinities(next);
        setAiPicked(true);
        setSuggestError(false);
      } else {
        setSuggestError(true);
      }
    } finally {
      setSuggesting(false);
    }
  };

  const addSkill = () => {
    if (!name.trim()) return;
    const entries = Object.entries(affinities);
    let statAffinities = [];
    if (entries.length) {
      const sum = entries.reduce((a, [, w]) => a + w, 0);
      const scale = sum > 100 ? 100 / sum : 1;
      statAffinities = entries.map(([statId, w]) => ({ statId, weight: Math.round(w * scale) }));
    }
    setSkills([...skills, { id: uid(), name: name.trim(), level: 1, xp: 0, totalXp: 0, statAffinities, dailyXp: 0, dailyXpDate: null }]);
    setName("");
    setAffinities({});
    setAiPicked(false);
    setSuggestError(false);
    setShowForm(false);
  };
  const removeSkill = (id) => setSkills(skills.filter((s) => s.id !== id));

  const takeSnapshot = () => {
    const label = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const snap = {
      id: uid(),
      label,
      takenAt: new Date().toISOString(),
      stats: stats.map((s) => ({ name: s.name, level: s.level })),
      skills: skills.map((s) => ({ name: s.name, level: s.level })),
      overallLevel: overall.level,
    };
    setSnapshots([snap, ...snapshots]);
  };
  const removeSnapshot = (id) => setSnapshots(snapshots.filter((s) => s.id !== id));

  return (
    <div className="space-y-3">
      {readOnly ? null : showForm ? (
        <Card className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (Object.keys(affinities).length === 0 && name.trim()) handleSuggest();
            }}
            placeholder="Skill name (e.g. Programming, Running)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-neutral-400">Feeds into stats (optional)</p>
              <button
                onClick={handleSuggest}
                disabled={!name.trim() || suggesting}
                className="text-xs text-violet-600 font-medium disabled:opacity-40 flex items-center gap-1"
              >
                <Sparkles size={11} />
                {suggesting ? "Thinking..." : "Auto-detect"}
              </button>
            </div>
            <div className="space-y-1.5">
              {stats.map((s) => {
                const checked = s.id in affinities;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAffinity(s.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        checked ? "bg-emerald-500 border-emerald-500" : "border-neutral-600"
                      }`}
                    >
                      {checked && <Check size={10} className="text-white" />}
                    </button>
                    <span className="text-sm text-neutral-300 flex-1">{s.name}</span>
                    {checked && (
                      <input
                        type="number"
                        value={affinities[s.id]}
                        onChange={(e) => setAffinityWeight(s.id, parseInt(e.target.value) || 0)}
                        className="w-16 border border-neutral-600 rounded-lg px-2 py-1 text-xs bg-neutral-800 outline-none focus:border-neutral-500"
                        placeholder="%"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {Object.keys(affinities).length > 0 && (
              <p className={`text-xs mt-1.5 ${affinitySum <= 100 ? "text-neutral-500" : "text-amber-600"}`}>
                Total: {affinitySum}% {affinitySum > 100 && "— will be scaled down to 100%"}
              </p>
            )}
            {aiPicked && Object.keys(affinities).length > 0 && (
              <p className="text-xs text-violet-600 mt-1 flex items-center gap-1">
                <Sparkles size={10} /> Auto-detected — edit if needed
              </p>
            )}
            {suggestError && <p className="text-xs text-red-500 mt-1.5">Couldn't get a suggestion, pick manually instead.</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={addSkill} className="bg-violet-600 text-white rounded-lg px-3 py-2 text-sm flex-1">
              Add skill
            </button>
            <button onClick={() => setShowForm(false)} className="border border-neutral-600 rounded-lg px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400 flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add skill
        </button>
      )}

      {skills.length === 0 && !showForm && (
        <p className="text-sm text-neutral-500 text-center py-6">No skills yet. Add one, set which stats it feeds, then link habits to it.</p>
      )}

      {skills.length > 0 && (
        <Card>
          <div className="grid grid-cols-4 gap-y-4 justify-items-center">
            {skills.map((s) => (
              <div key={s.id} className="relative">
                <CircularStat
                  level={s.level}
                  xpPct={(s.xp / skillXpThreshold(s.level)) * 100}
                  xpText={`${Math.round(s.xp)}/${skillXpThreshold(s.level)}`}
                  label={s.name}
                  sublabel={rankOf(s.level)}
                  ringColor="stroke-emerald-500"
                  onRemove={readOnly ? undefined : () => removeSkill(s.id)}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="pt-2">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Snapshots</p>
          {!readOnly && (
            <button onClick={takeSnapshot} className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1">
              <Camera size={12} /> Take snapshot
            </button>
          )}
        </div>
        {snapshots.length === 0 && <p className="text-xs text-neutral-500 px-1">No snapshots yet. Take one now and again down the road to see how far you've come.</p>}
        <div className="space-y-2">
          {snapshots.map((snap) => (
            <Card key={snap.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-neutral-200">{snap.label}</span>
                {!readOnly && (
                  <button onClick={() => removeSnapshot(snap.id)} className="text-neutral-600 hover:text-red-500">
                    <X size={13} />
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-400">
                Overall Lv.{snap.overallLevel} · {snap.stats.map((s) => `${s.name} ${s.level}`).join(", ")}
              </p>
              {snap.skills.length > 0 && (
                <p className="text-xs text-neutral-500 mt-1">{snap.skills.map((s) => `${s.name} ${s.level}`).join(", ")}</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Workouts ----------

function ExercisePage({ exercise, workoutLogs, setWorkoutLogs, onRemove, readOnly }) {
  const today = todayStr();

  const logsForThis = workoutLogs.filter((l) => l.exerciseId === exercise.id);
  const todayLog = logsForThis.find((l) => l.date === today);
  const pastLogs = logsForThis.filter((l) => l.date !== today).sort((a, b) => b.date.localeCompare(a.date));
  const lastLog = pastLogs[0] || null;

  const [sets, setSets] = useState(() => {
    const source = todayLog || lastLog;
    return source ? source.sets.map((s) => ({ ...s })) : [{ weight: "", reps: "" }];
  });

  const pb = (() => {
    let best = null;
    logsForThis.forEach((l) =>
      l.sets.forEach((s) => {
        if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = s;
      })
    );
    return best;
  })();

  const updateSet = (i, field, value) => {
    setSets(sets.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };
  const addRow = () => {
    const lastRow = sets[sets.length - 1];
    setSets([...sets, { weight: lastRow ? lastRow.weight : "", reps: "" }]);
  };
  const removeRow = (i) => setSets(sets.filter((_, idx) => idx !== i));

  const saveEntry = () => {
    const clean = sets
      .map((s) => ({ weight: parseFloat(s.weight), reps: parseInt(s.reps) }))
      .filter((s) => !isNaN(s.weight) && !isNaN(s.reps));
    if (clean.length === 0) return;
    if (todayLog) {
      setWorkoutLogs(workoutLogs.map((l) => (l.id === todayLog.id ? { ...l, sets: clean } : l)));
    } else {
      setWorkoutLogs([...workoutLogs, { id: uid(), exerciseId: exercise.id, date: today, sets: clean }]);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-neutral-200">{exercise.name}</span>
        {!readOnly && (
          <button onClick={onRemove} className="text-neutral-600 hover:text-red-500">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400 mb-3">
        {lastLog && (
          <span>
            Last ({new Date(lastLog.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}):{" "}
            {lastLog.sets.map((s) => `${s.weight}×${s.reps}`).join(", ")}
          </span>
        )}
        {pb && (
          <span className="flex items-center gap-1">
            <Flame size={11} className="text-orange-500" /> PB: {pb.weight}kg × {pb.reps}
          </span>
        )}
        {!lastLog && !pb && <span>No history yet — log your first sets below.</span>}
      </div>

      {!readOnly && (
        <>
          <div className="space-y-1.5">
            {sets.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 w-10 shrink-0">Set {i + 1}</span>
                <input
                  type="number"
                  value={s.weight}
                  onChange={(e) => updateSet(i, "weight", e.target.value)}
                  placeholder="kg"
                  className="flex-1 border border-neutral-600 rounded-lg px-2 py-1.5 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
                />
                <span className="text-xs text-neutral-500">×</span>
                <input
                  type="number"
                  value={s.reps}
                  onChange={(e) => updateSet(i, "reps", e.target.value)}
                  placeholder="reps"
                  className="flex-1 border border-neutral-600 rounded-lg px-2 py-1.5 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
                />
                <button onClick={() => removeRow(i)} className="text-neutral-600 hover:text-red-500 shrink-0">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={addRow}
              className="flex-1 border border-dashed border-neutral-600 rounded-lg py-1.5 text-xs text-neutral-400 flex items-center justify-center gap-1"
            >
              <Plus size={12} /> Add set
            </button>
            <button onClick={saveEntry} className="flex-1 bg-emerald-600 text-white rounded-lg py-1.5 text-xs">
              {todayLog ? "Update today" : "Log today"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function WorkoutsView({ exercises, setExercises, categories, setCategories, workoutLogs, setWorkoutLogs, readOnly }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all"); // "all" | "uncategorized" | category id
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const addExercise = () => {
    if (!name.trim()) return;
    const categoryId = selectedCategoryId === "all" || selectedCategoryId === "uncategorized" ? null : selectedCategoryId;
    setExercises([{ id: uid(), name: name.trim(), categoryId }, ...exercises]);
    setName("");
    setShowForm(false);
  };
  const removeExercise = (id) => {
    setExercises(exercises.filter((e) => e.id !== id));
    setWorkoutLogs(workoutLogs.filter((l) => l.exerciseId !== id));
  };

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    if (categories.some((c) => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
      setNewCategoryName("");
      setShowCategoryForm(false);
      return;
    }
    setCategories([...categories, { id: uid(), name: newCategoryName.trim() }]);
    setNewCategoryName("");
    setShowCategoryForm(false);
  };
  const removeCategory = (id) => {
    setCategories(categories.filter((c) => c.id !== id));
    // exercises in a deleted category fall back to Uncategorized rather than vanishing
    setExercises(exercises.map((e) => (e.categoryId === id ? { ...e, categoryId: null } : e)));
    if (selectedCategoryId === id) setSelectedCategoryId("all");
  };

  const visibleExercises = exercises.filter((e) => {
    if (selectedCategoryId === "all") return true;
    if (selectedCategoryId === "uncategorized") return !e.categoryId;
    return e.categoryId === selectedCategoryId;
  });

  return (
    <div className="space-y-3">
      {/* Category filter/tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        <button
          onClick={() => setSelectedCategoryId("all")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap ${
            selectedCategoryId === "all" ? "bg-violet-600 text-white" : "bg-neutral-800 text-neutral-400 border border-neutral-700"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategoryId(c.id)}
            className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs whitespace-nowrap ${
              selectedCategoryId === c.id ? "bg-violet-600 text-white" : "bg-neutral-800 text-neutral-400 border border-neutral-700"
            }`}
          >
            <Folder size={11} /> {c.name}
          </button>
        ))}
        <button
          onClick={() => setSelectedCategoryId("uncategorized")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs whitespace-nowrap ${
            selectedCategoryId === "uncategorized" ? "bg-violet-600 text-white" : "bg-neutral-800 text-neutral-400 border border-neutral-700"
          }`}
        >
          Uncategorized
        </button>
        {!readOnly && (
          <button
            onClick={() => setShowCategoryForm(true)}
            className="shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs whitespace-nowrap border border-dashed border-neutral-600 text-neutral-400"
          >
            <Plus size={11} /> Category
          </button>
        )}
      </div>

      {!readOnly && showCategoryForm && (
        <Card className="space-y-2">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="Category name (e.g. Shoulder Day)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={addCategory} className="flex-1 bg-violet-600 text-white rounded-lg px-3 py-2 text-sm">
              Add category
            </button>
            <button
              onClick={() => {
                setShowCategoryForm(false);
                setNewCategoryName("");
              }}
              className="flex-1 border border-neutral-600 rounded-lg px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* Custom (non-default) categories can be deleted */}
      {!readOnly && selectedCategoryId !== "all" && selectedCategoryId !== "uncategorized" && (
        <button
          onClick={() => removeCategory(selectedCategoryId)}
          className="text-xs text-neutral-500 hover:text-red-400 flex items-center gap-1"
        >
          <Trash2 size={11} /> Delete this category
        </button>
      )}

      {readOnly ? null : showForm ? (
        <Card className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExercise()}
            placeholder="Exercise name (e.g. Bench Press)"
            className="w-full border border-neutral-600 rounded-lg px-3 py-2 text-sm bg-neutral-800 outline-none focus:border-neutral-500"
          />
          <div className="flex gap-2">
            <button onClick={addExercise} className="flex-1 bg-violet-600 text-white rounded-lg px-3 py-2 text-sm">
              Add
            </button>
            <button onClick={() => setShowForm(false)} className="flex-1 border border-neutral-600 rounded-lg px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed border-neutral-600 rounded-lg py-2.5 text-sm text-neutral-400 flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add exercise
        </button>
      )}

      {visibleExercises.length === 0 && !showForm && (
        <p className="text-sm text-neutral-500 text-center py-6">
          {exercises.length === 0
            ? "No exercises yet. Add one — it'll stay in your notebook so you just update sets each time."
            : "No exercises in this category yet."}
        </p>
      )}

      <div className="space-y-2">
        {visibleExercises.map((ex) => (
          <ExercisePage
            key={ex.id}
            exercise={ex}
            workoutLogs={workoutLogs}
            setWorkoutLogs={setWorkoutLogs}
            onRemove={readOnly ? undefined : () => removeExercise(ex.id)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Week ----------

function WeekView({ tasks, habits }) {
  const days = last7();
  const dayPct = (d) => {
    const dt = tasks.filter((t) => t.date === d);
    const dh = habits.filter((h) => (h.freqType === "days" ? (h.days || []).includes(weekdayOf(d)) : true));
    const total = dt.length + dh.length;
    if (!total) return null;
    const done = dt.filter((t) => t.completed).length + dh.filter((h) => h.completions[d]).length;
    return (done / total) * 100;
  };

  return (
    <Card>
      <p className="text-sm font-medium text-neutral-300 mb-3">Combined completion, last 7 days</p>
      <div className="space-y-2">
        {days.map((d) => {
          const p = dayPct(d);
          return (
            <div key={d} className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 w-9">{dayLabel(d)}</span>
              <div className="flex-1">
                <Bar pct={p ?? 0} />
              </div>
              <span className="text-xs text-neutral-400 w-9 text-right">{p === null ? "—" : `${Math.round(p)}%`}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
