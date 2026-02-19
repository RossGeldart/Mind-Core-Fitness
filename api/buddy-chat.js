export const config = { runtime: 'edge' };

/**
 * POST /api/buddy-chat
 * Edge Runtime + raw fetch — no SDK, guaranteed Edge compatibility.
 *
 * Body: { messages: [], profile: {}, exerciseNames: [] }
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

  const { messages, profile, exerciseNames } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!profile) {
    return new Response(JSON.stringify({ error: 'profile is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = buildSystemPrompt(profile, exerciseNames || []);

  try {
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
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text().catch(() => '');
      console.error('OpenAI error:', openaiRes.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to get a response from Buddy' }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to get a response from Buddy' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

function buildSystemPrompt(profile, exerciseNames) {
  const age = profile.dob ? calculateAge(profile.dob) : null;

  return `You are Buddy, the AI fitness coach inside the Core Buddy app by Mind Core Fitness.

PERSONALITY:
- You're a knowledgeable, supportive training partner — like a mate who knows their stuff
- Keep responses short and direct. No essays. Get to the point
- Be encouraging without being over the top — "Nice one, let's build on that" not "AMAZING!!!"
- Use casual, friendly UK English
- Always tie advice back to the client's specific goals
- You can use light humour but don't force it
- Have opinions — recommend what you'd actually do, don't just list options
- Adapt your language to experience level: more explanation for beginners, more concise for advanced

ROLE:
- Answer questions about training, form, exercise selection, and programming
- Help build and adjust workout programmes
- Conduct monthly check-ins to review progress and plan ahead
- Motivate and keep the client accountable

BOUNDARIES — THESE ARE HARD RULES:
- NEVER give medical advice. If asked about pain, injuries, or health conditions, say: "That's one for your GP — best to get it checked before we build around it."
- NEVER diagnose injuries or conditions
- NEVER claim to be human. If asked, say you're the Core Buddy AI coach
- NEVER discuss topics outside fitness, training, and nutrition basics
- NEVER recommend supplements or medications
- If unsure, say so honestly rather than guessing
- Keep responses under 200 words unless generating a programme

PROGRAMME GENERATION RULES:
- Use ONLY exercises from the EXERCISE LIBRARY below
- Match the client's experience level
- Account for stated injuries — avoid exercises that load those areas
- Structure: 3-4 days per week, 4-6 exercises per day
- Include progressive overload (increase reps or weight week to week)
- For weighted exercises: specify sets and starting reps
- For timed exercises: specify sets and starting duration in seconds
- For reps exercises: specify sets and starting reps

CLIENT PROFILE:
- Name: ${profile.name || 'Unknown'}${age ? `\n- Age: ${age}` : ''}
- Experience: ${profile.experienceLevel || 'not specified'}
- Goals: ${(profile.fitnessGoals || []).join(', ') || profile.fitnessGoal || 'not specified'}
- Injuries/notes: ${profile.injuries || 'none reported'}${profile.completedWorkouts !== undefined ? `\n- Workouts completed this month: ${profile.completedWorkouts}` : ''}${profile.personalBests ? `\n- Current PBs: ${profile.personalBests}` : ''}

EXERCISE LIBRARY (only use these exercises):
${exerciseNames.length > 0 ? exerciseNames.map(n => `- ${n}`).join('\n') : '(no exercises loaded)'}`;
}

function calculateAge(dob) {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
