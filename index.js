const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const twilio = require('twilio');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Store conversation state in memory (replace with Redis or DB in production)
let conversationMemory = {};

// 🔊 Generate ElevenLabs voice audio from GPT reply
const generateElevenLabsAudio = async (text) => {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/56AoDkrOh6qfVPDXZ7Pt`,
      {
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    return Buffer.from(response.data, 'binary').toString('base64');
  } catch (err) {
    console.error('ElevenLabs error:', err.message);
    return null;
  }
};

// 💬 Get GPT-4 reply from conversation
const getGPTResponse = async (userText, sessionId) => {
  if (!conversationMemory[sessionId]) {
    conversationMemory[sessionId] = [
      {
        role: 'system',
        content:
          "You're a friendly, confident real estate investor like Grant Cardone or Pace Morby. You're cold calling homeowners to see if they’d consider selling if the price made sense. Speak naturally, be persuasive, ask qualifying questions, and respond casually.",
      },
    ];
  }

  conversationMemory[sessionId].push({ role: 'user', content: userText });

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: conversationMemory[sessionId],
  });

  const reply = response.choices[0].message.content;
  conversationMemory[sessionId].push({ role: 'assistant', content: reply });
  return reply;
};

// ☎️ Initial call route
app.post('/voice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const initialText =
    "Hi, this is Logan with Willow Brooke Homes. I know this is out of the blue, but I wanted to see if you’d consider selling your property if the price made sense?";

  const audioBase64 = await generateElevenLabsAudio(initialText);

  if (!audioBase64) {
    twiml.say('There was an error playing the message.');
    return res.type('text/xml').send(twiml.toString());
  }

  const gather = twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST',
  });

  gather.play({ loop: 1 }, `data:audio/mpeg;base64,${audioBase64}`);
  res.type('text/xml').send(twiml.toString());
});

// 🔁 Process replies and loop GPT + ElevenLabs
app.post('/process', async (req, res) => {
  const userSpeech = req.body.SpeechResult || '';
  const callSid = req.body.CallSid;

  const reply = await getGPTResponse(userSpeech, callSid);
  const audioBase64 = await generateElevenLabsAudio(reply);

  const twiml = new twilio.twiml.VoiceResponse();

  if (!audioBase64) {
    twiml.say("Sorry, something went wrong with the response.");
  } else {
    const gather = twiml.gather({
      input: 'speech',
      speechTimeout: 'auto',
      action: '/process',
      method: 'POST',
    });

    gather.play({ loop: 1 }, `data:audio/mpeg;base64,${audioBase64}`);
  }

  res.type('text/xml').send(twiml.toString());
});

// 🚀 Outbound trigger from Zapier or GoHighLevel
app.post('/call', (req, res) => {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const toNumber = req.body.to;

  client.calls
    .create({
      url: 'https://aicoldcaller2.onrender.com/voice',
      to: toNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    })
    .then((call) => {
      console.log('✅ Outbound call started:', call.sid);
      res.send({ success: true });
    })
    .catch((err) => {
      console.error('❌ Call failed:', err.message);
      res.status(500).send({ success: false });
    });
});

// 🎯 Start the server
app.listen(port, () => {
  console.log(`AI caller server is live on port ${port}`);
});
