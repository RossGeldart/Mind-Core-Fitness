export const config = { runtime: 'edge' };

const PLAN_MARKER_START = '|||PLAN|||';
const PLAN_MARKER_END = '|||END_PLAN|||';

/**
 * POST /api/buddy-generate-plan
 * Edge Runtime + raw fetch streaming — no SDK, guaranteed Edge compatibility.
 *
 * Body: { profile: {}, exerciseLibrary: [] }
 * Returns: SSE stream — intermediate chunks + final { done, reply, plan } event
 */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Allow': 'POST', 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { profile, exerciseLibrary } = body;

  if (!profile) {
    return new Response(JSON.stringify({ error: 'profile is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!exerciseLibrary || !Array.isArray(exerciseLibrary) || exerciseLibrary.length === 0) {
    return new Response(JSON.stringify({ error: 'exerciseLibrary array is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildPlanPrompt(profile, exerciseLibrary);

  try {
    // Call OpenAI directly with fetch — no SDK needed on Edge
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate my personalised monthly plan based on my profile.' },
        ],
        temperature: 0.6,
        max_tokens: 8192,
        stream: true,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text().catch(() => '');
      console.error('OpenAI error:', openaiRes.status, errText);
      return new Response(JSON.stringify({ error: `AI service error (${openaiRes.status})` }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          // Read OpenAI's SSE stream
          const reader = openaiRes.body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });

            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop();

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  const content = parsed.choices?.[0]?.delta?.content || '';
                  if (content) {
                    fullText += content;
                    // Forward chunk to our client
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: content })}\n\n`));
                  }
                } catch { /* skip malformed */ }
              }
            }
          }

          // Parse the accumulated response
          const planStart = fullText.indexOf(PLAN_MARKER_START);
          const planEnd = fullText.indexOf(PLAN_MARKER_END);

          if (planStart !== -1 && planEnd !== -1) {
            const jsonStr = fullText.slice(planStart + PLAN_MARKER_START.length, planEnd).trim();
            const reply = fullText.slice(0, planStart).trim();
            try {
              const plan = JSON.parse(jsonStr);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply, plan })}\n\n`));
            } catch {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply, error: 'Plan structure was invalid — try again' })}\n\n`));
            }
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply: fullText })}\n\n`));
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, error: 'Failed to generate plan' })}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to generate plan' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

function buildPlanPrompt(profile, exerciseLibrary) {
  const age = profile.dob ? calculateAge(profile.dob) : null;
  const daysPerWeek = parseDaysPerWeek(profile.availability);

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
  const lower = availability.toLowerCase();
  if (lower.includes('every day') || lower.includes('daily')) return 5;
  if (lower.includes('5') || lower.includes('five')) return 5;
  if (lower.includes('4') || lower.includes('four')) return 4;
  if (lower.includes('2') || lower.includes('two') || lower.includes('twice')) return 2;
  return 3;
}

function calculateAge(dob) {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
