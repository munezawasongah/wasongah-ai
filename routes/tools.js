const express = require('express');
const router = express.Router();
const { generate } = require('../src/gemini');

const TOOL_CONFIGS = {
  write: {
    system: 'You are an expert content writer. Write engaging, well-structured, original content.',
    buildPrompt: (b) => {
      if (!b.topic) throw new Error('topic is required');
      return `Write a ${b.length||'Medium'} ${b.type||'Blog Post'} with a ${b.tone||'Professional'} tone about: "${b.topic}".`;
    }
  },
  summarize: {
    system: 'You are an expert at distilling complex information into clear summaries.',
    buildPrompt: (b) => {
      if (!b.text) throw new Error('text is required');
      return `Summarize as "${b.style||'Bullet Points'}":\n\n${b.text}`;
    }
  },
  translate: {
    system: 'You are a professional translator. Translate accurately, preserving tone.',
    buildPrompt: (b) => {
      if (!b.text || !b.to) throw new Error('text and to language are required');
      return `Translate from ${b.from||'Auto-detect'} to ${b.to} (${b.style||'Natural'} style). Return ONLY the translation:\n\n${b.text}`;
    }
  },
  code: {
    system: 'You are an expert software engineer. Write clean, production-quality code.',
    buildPrompt: (b) => {
      if (!b.input) throw new Error('input is required');
      return `${b.task||'Write Code'} in ${b.language||'JavaScript'}:\n\n${b.input}`;
    }
  },
  image: {
    system: 'You are an expert image analyst. Provide thorough, accurate analysis.',
    buildPrompt: (b) => {
      if (!b.imageBase64 || !b.imageMime) throw new Error('imageBase64 and imageMime are required');
      return { isImage: true, ...b };
    }
  },
  ideas: {
    system: 'You are a world-class creative strategist. Generate bold, specific, actionable ideas.',
    buildPrompt: (b) => {
      if (!b.topic) throw new Error('topic is required');
      return `Generate ${b.count||'10'} ${b.type||'Business Ideas'} for: "${b.topic}". Creativity: ${b.creativity||'Balanced'}. Number each with a name and 1-2 sentence description.`;
    }
  },
  document: {
    system: 'You are an expert professional document writer. Produce complete, polished, ready-to-use documents in clean Markdown (use # headings, bullet lists and tables where helpful). Never invent personal facts: where details are missing, use clear [placeholders] in square brackets. Output only the document, with no commentary before or after it.',
    buildPrompt: (b) => {
      if (!b.details) throw new Error('details are required');
      const guides = {
        'CV / Resume': 'Create a one-to-two page CV: name and contact line, professional summary, experience (reverse chronological, achievement bullets with measurable results), education, skills, and optional certifications. Tailor it to the target role if one is given.',
        'Cover Letter': 'Write a concise, persuasive cover letter (under 350 words), properly addressed and tailored to the role.',
        'Presentation Outline': 'Create a slide-by-slide outline. For each slide give a title, 3-5 bullet points and a one-line speaker note. Start with a title slide and end with a clear call to action.',
        'Meeting Minutes': 'Turn the notes into minutes: meeting details, attendees, topics discussed, decisions made, an action items table (owner, task, due date) and the next meeting.',
        'Business Proposal': 'Write a proposal with: executive summary, problem, proposed solution, scope and deliverables, timeline, pricing or budget (use placeholders if unknown), terms and next steps.',
        'Lesson Plan': 'Create a lesson plan with: title, level, duration, learning objectives, materials, a step-by-step lesson with timings, activities, assessment, homework and differentiation ideas.',
        'Quiz / Worksheet': 'Create a worksheet with a mix of question types, then an answer key at the end.',
        'Report': 'Write a report with: title, executive summary, background, findings, analysis, recommendations and conclusion.',
      };
      const type = guides[b.type] ? b.type : 'Report';
      const lang = b.language && b.language !== 'Auto' ? `Write the document in ${String(b.language).slice(0, 30)}.\n` : '';
      return `${guides[type]}\n\nTone: ${b.tone || 'Professional'}.\n${lang}\nDetails provided by the user:\n${b.details}` +
        (b.extra ? `\n\nAdditional context (job description, audience, requirements):\n${b.extra}` : '');
    }
  },
  email: {
    system: 'You are an expert email copywriter. Write effective, professional emails.',
    buildPrompt: (b) => {
      if (!b.context) throw new Error('context is required');
      return `Write a ${b.purpose||'Professional'} email from ${b.from||'sender'} to ${b.to||'recipient'} (${b.tone||'Professional'} tone): ${b.context}. Include subject line and proper formatting.`;
    }
  },
};

router.post('/:tool', async (req, res) => {
  const { tool } = req.params;
  if (!TOOL_CONFIGS[tool]) {
    return res.status(404).json({ error: `Tool "${tool}" not found`, available: Object.keys(TOOL_CONFIGS) });
  }

  try {
    const config = TOOL_CONFIGS[tool];
    const promptData = config.buildPrompt(req.body);
    let messages;
    if (promptData?.isImage) {
      messages = [{ role:'user', content:[
        { inlineData: { mimeType: promptData.imageMime, data: promptData.imageBase64 } },
        { text: `Task: ${promptData.task||'Describe it'}. ${promptData.extra||''}` }
      ]}];
    } else {
      messages = [{ role:'user', content: promptData }];
    }

    const text = await generate({ messages, system: config.system });

    res.json({ success: true, tool, text });
  } catch (err) {
    if (!err.status && /required$/.test(err.message)) return res.status(400).json({ error: err.message });
    console.error(`[Tool:${tool}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
