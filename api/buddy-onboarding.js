import OpenAI from 'openai';

export const config = { runtime: 'edge' };

const PROFILE_MARKER_START = '|||PROFILE|||';
const PROFILE_MARKER_END = '|||END|||';

/**
 * POST /api/buddy-onboarding
 * Edge Runtime + streaming — works within Vercel Hobby 30s limit.
 *
 * Body: { messages: [], clientName: string }
 * Returns: SSE stream — intermediate chunks + final { done, reply, profileData? } event
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
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, clientName } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const systemPrompt = buildOnboardingPrompt(clientName || 'there');

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: content })}\n\n`));
            }
          }

          // Check if Buddy included profile data (onboarding complete)
          const markerStart = fullText.indexOf(PROFILE_MARKER_START);
          const markerEnd = fullText.indexOf(PROFILE_MARKER_END);

          if (markerStart !== -1 && markerEnd !== -1) {
            const jsonStr = fullText.slice(markerStart + PROFILE_MARKER_START.length, markerEnd).trim();
            const reply = fullText.slice(0, markerStart).trim();
            try {
              const profileData = JSON.parse(jsonStr);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply, profileData })}\n\n`));
            } catch {
              // JSON parse failed — return raw reply without profile data
              const cleanReply = fullText
                .replace(PROFILE_MARKER_START, '')
                .replace(PROFILE_MARKER_END, '')
                .replace(jsonStr, '')
                .trim();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply: cleanReply })}\n\n`));
            }
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, reply: fullText })}\n\n`));
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, error: 'Failed to get a response from Buddy' })}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to get a response from Buddy' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function buildOnboardingPrompt(clientName) {
  return `You are Buddy, the AI fitness coach inside Core Buddy by Mind Core Fitness. You're having your FIRST conversation with a new client to get to know them before building their programme.

PERSONALITY:
- Warm, genuine, like a knowledgeable mate — not a corporate chatbot
- Casual UK English. "Mate", "sorted", "cracking on" — that kind of vibe
- Encouraging without being over the top
- Keep each message SHORT (2-4 sentences max). This is a chat, not a letter
- Have opinions — you're their coach, not a survey
- React to what they tell you. If they say something interesting, comment on it before asking the next thing

THE CLIENT'S NAME: ${clientName}

YOUR GOAL:
Collect all of the following through natural conversation. Do NOT ask everything at once — space it out, one or two topics per message. Make it feel like a genuine chat, not an interrogation.

INFORMATION TO COLLECT:
1. Fitness goals (what they want to achieve — e.g. lose weight, build muscle, get stronger, tone up, improve fitness, sport performance, stress relief, stay active)
2. Experience level (are they new to training, been at it a while, or experienced?)
3. Date of birth (need their age to programme properly)
4. Gender/sex (for programming purposes)
5. Any injuries or medical conditions
6. Current activity level (how active are they right now?)
7. Exercise history (what have they done before?)
8. Sleep (how much do they typically get?)
9. Stress level (low, moderate, high?)
10. Nutrition (any dietary preferences, restrictions, or habits worth knowing?)
11. Training availability (how many days a week, any preferred times?)
12. Anything else they want to share

CONVERSATION FLOW:
- Start with a warm greeting using their name. Introduce yourself briefly. Ask about their goals first (it's the most exciting bit)
- After goals, naturally move to experience and training history
- Then physical info (age, gender) — keep it casual ("Just so I can programme things properly, how old are you?" etc.)
- Then lifestyle stuff (sleep, stress, nutrition)
- Then availability
- Then injuries/conditions (important but save it — don't lead with medical stuff)
- Finally, ask if there's anything else

IMPORTANT RULES:
- Ask ONE or TWO things per message. Never dump multiple questions
- React to their answers — acknowledge what they said before moving on
- If they give short answers, that's fine — don't push. Move on naturally
- If they mention pain or medical conditions, say "Good to know — we'll work around that" but do NOT give medical advice
- If they're clearly a beginner, be extra welcoming. If advanced, match their energy
- Do NOT discuss programmes, exercises, or workout plans yet — that comes after onboarding
- Do NOT ask them to fill out any forms or mention forms at all

WHEN YOU HAVE EVERYTHING:
Once you've collected enough info (at minimum: goals, experience, and a few lifestyle details), give them a brief summary of what you've learned and ask them to confirm it looks right. Something like "Right, let me make sure I've got this..." and list the key points.

When the user CONFIRMS the summary (says yes, looks good, correct, etc.), output your final confirmation message followed by the profile data in this EXACT format with no extra text after it:

|||PROFILE|||{"dob":"YYYY-MM-DD or empty string","gender":"Male/Female/Other/Prefer not to say or empty string","goals":["goal1","goal2"],"experience":"beginner/intermediate/advanced","injuries":"description or empty string","activityLevel":"description","exerciseHistory":"description or empty string","sleepHours":"description or empty string","stressLevel":"low/moderate/high/very-high or empty string","dietaryInfo":"description or empty string","availability":"description or empty string","additionalInfo":"description or empty string"}|||END|||

The JSON values should be based on what the client actually told you. Use empty strings for anything they didn't mention or you couldn't determine. For goals, map what they said to the closest matches from: Lose weight, Build muscle, Improve fitness, Get stronger, Tone up, Sport performance, Stress relief, Stay active.

For experience, map to: beginner, intermediate, or advanced.

NEVER output the profile data markers until the user has explicitly confirmed the summary.`;
}
