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
