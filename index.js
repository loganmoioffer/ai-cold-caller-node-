require('dotenv').config();
const express = require('express');
const axios = require('axios');
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post('/voice', async (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST'
  });
  gather.say('Hi, this is Logan with Willow Brooke Homes. Are you interested in selling your property?');

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/process', async (req, res) => {
  const userSpeech = req.body.SpeechResult || 'No speech detected';
  const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'system', content: 'You are a real estate assistant calling property owners.' },
               { role: 'user', content: userSpeech }]
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  const gptReply = openaiResponse.data.choices[0].message.content;

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/process',
    method: 'POST'
  });
  gather.say(gptReply);

  res.type('text/xml');
  res.send(twiml.toString());
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
