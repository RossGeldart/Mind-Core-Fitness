import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PLAN_MARKER_START = '|||PLAN|||';
const PLAN_MARKER_END = '|||END_PLAN|||';

// Allow up to 60s for plan generation (Vercel Pro) — Hobby allows 10s max
export const config = { maxDuration: 60 };

/**
 * POST /api/buddy-generate-plan
 * Body: { profile: {}, exerciseLibrary: [] }
 *
 * profile        – onboarding data (goals, experience, injuries, availability, etc.)
 * exerciseLibrary – array of { name, type, equipment, group } for allowed exercises
 *
 * Returns: { reply: string, plan?: object }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { profile, exerciseLibrary } = req.body;

  if (!profile) {
    return res.status(400).json({ error: 'profile is required' });
  }

  if (!exerciseLibrary || !Array.isArray(exerciseLibrary) || exerciseLibrary.length === 0) {
    return res.status(400).json({ error: 'exerciseLibrary array is required' });
  }

  try {
    const systemPrompt = buildPlanPrompt(profile, exerciseLibrary);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate my personalised monthly plan based on my profile.' },
      ],
      temperature: 0.6,
      max_tokens: 8192,
    });

    const raw = completion.choices[0]?.message?.content || '';

    // Extract structured plan JSON
    const markerStart = raw.indexOf(PLAN_MARKER_START);
    const markerEnd = raw.indexOf(PLAN_MARKER_END);

    if (markerStart !== -1 && markerEnd !== -1) {
      const jsonStr = raw.slice(markerStart + PLAN_MARKER_START.length, markerEnd).trim();
      const reply = raw.slice(0, markerStart).trim();

      try {
        const plan = JSON.parse(jsonStr);
        return res.status(200).json({ reply, plan });
      } catch {
        // JSON parse failed — return raw reply
        return res.status(200).json({
          reply: raw.replace(PLAN_MARKER_START, '').replace(PLAN_MARKER_END, '').replace(jsonStr, '').trim(),
          error: 'Plan generation produced invalid structure — try again',
        });
      }
    }

    // No markers found — return raw reply
    return res.status(200).json({ reply: raw });
  } catch (err) {
    console.error('Buddy generate plan error:', err);
    return res.status(500).json({ error: 'Failed to generate plan' });
  }
}

function buildPlanPrompt(profile, exerciseLibrary) {
  const age = profile.dob ? calculateAge(profile.dob) : null;
  const daysPerWeek = parseDaysPerWeek(profile.availability);

  // Group exercises for the prompt
  const exercisesByGroup = {};
  for (const ex of exerciseLibrary) {
    if (!exercisesByGroup[ex.group]) exercisesByGroup[ex.group] = [];
    exercisesByGroup[ex.group].push(`${ex.name} (${ex.type}, ${ex.equipment})`);
  }

  const exerciseList = Object.entries(exercisesByGroup)
    .map(([group, exercises]) => `${group.toUpperCase()}:\n${exercises.map(e => `  - ${e}`).join('\n')}`)
    .join('\n\n');

  return `You are Buddy, an expert AI fitness coach. You must generate a personalised 4-WEEK MONTHLY training plan for this client.

CLIENT PROFILE:
- Name: ${profile.name || 'Client'}${age ? `\n- Age: ${age}` : ''}${profile.gender ? `\n- Gender: ${profile.gender}` : ''}
- Goals: ${(profile.goals || []).join(', ') || 'general fitness'}
- Experience: ${profile.experience || 'beginner'}
- Injuries/conditions: ${profile.injuries || 'none reported'}
- Activity level: ${profile.activityLevel || 'not specified'}
- Exercise history: ${profile.exerciseHistory || 'not specified'}
- Sleep: ${profile.sleepHours || 'not specified'}
- Stress: ${profile.stressLevel || 'not specified'}
- Availability: ${profile.availability || 'not specified'} (${daysPerWeek} days/week)
- Diet: ${profile.dietaryInfo || 'not specified'}
- Additional notes: ${profile.additionalInfo || 'none'}

EXERCISE LIBRARY (ONLY use exercises from this list):
${exerciseList}

PROGRAMMING RULES:
1. Plan exactly ${daysPerWeek} training days per week for 4 weeks
2. Each day must have 4-6 exercises
3. ONLY use exercise names EXACTLY as they appear in the library above — no renaming, no inventing
4. Balance across exercise groups (push, pull, lower, core) across the week
5. For BEGINNERS: favour bodyweight exercises, lower volume (3 sets), higher reps (10-15), simpler movements
6. For INTERMEDIATE: mix of weighted and bodyweight, moderate volume (3-4 sets), varied rep ranges (8-12)
7. For ADVANCED: more weighted exercises, higher volume (4 sets), progressive overload, compound-first
8. If injuries are reported, EXCLUDE exercises that load those areas. E.g. shoulder injury = no overhead pressing
9. Progressive overload across weeks: slightly increase reps, sets, or weight each week
10. Each training day should have a clear focus label (e.g. "Upper Push", "Lower Body", "Full Body", "Pull & Core")
11. For "weighted" exercises: specify sets, reps, and note to use appropriate weight
12. For "reps" exercises: specify sets and reps
13. For "timed" exercises: specify sets and duration in seconds

GOAL-SPECIFIC GUIDANCE:
- "Build muscle" / "Get stronger": prioritise weighted compound lifts, moderate-to-heavy loads, 3-4 sets of 6-12 reps
- "Lose weight" / "Tone up": higher reps (12-15), shorter rest, mix of compound and isolation, include timed core
- "Improve fitness" / "Stay active": balanced mix of all groups, moderate volume, variety each week
- "Sport performance": explosive movements (jump squats, burpees), compound lifts, core stability
- "Stress relief": balanced, not too intense, include timed holds (planks, hollow holds) for mindfulness

OUTPUT FORMAT:
First, write a short friendly message (2-3 sentences, UK English, casual) explaining the plan you've built and why it suits them. Then output the plan data in this EXACT format:

|||PLAN|||{
  "planName": "descriptive name based on their goals",
  "daysPerWeek": ${daysPerWeek},
  "experienceLevel": "${profile.experience || 'beginner'}",
  "goals": ${JSON.stringify(profile.goals || ['general fitness'])},
  "weeks": [
    {
      "weekNumber": 1,
      "days": [
        {
          "dayNumber": 1,
          "focus": "day focus label",
          "exercises": [
            {
              "name": "exact exercise name from library",
              "type": "weighted|reps|timed",
              "sets": 3,
              "reps": 10,
              "duration": null,
              "notes": "optional coaching note"
            }
          ]
        }
      ]
    }
  ]
}|||END_PLAN|||

For "timed" exercises, use "duration" (in seconds) instead of "reps" (set reps to null).
For "weighted" and "reps" exercises, use "reps" and set "duration" to null.

IMPORTANT: Output ONLY the friendly message followed by the plan markers. No extra text after |||END_PLAN|||.`;
}

function parseDaysPerWeek(availability) {
  if (!availability) return 3;
  const match = availability.match(/(\d)/);
  if (match) {
    const days = parseInt(match[1], 10);
    if (days >= 1 && days <= 7) return days;
  }
  // Keyword fallback
  const lower = availability.toLowerCase();
  if (lower.includes('every day') || lower.includes('daily')) return 5;
  if (lower.includes('5') || lower.includes('five')) return 5;
  if (lower.includes('4') || lower.includes('four')) return 4;
  if (lower.includes('2') || lower.includes('two') || lower.includes('twice')) return 2;
  return 3; // sensible default
}

function calculateAge(dob) {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
