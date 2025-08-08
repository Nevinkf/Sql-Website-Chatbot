import OpenAI from 'openai';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';

const __dirname = path.resolve();

dotenv.config();
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})

const PORT = process.env.PORT || 3001;
const app = express();
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{role: "user", content: message}]
    });
    res.json({reply: response.choices[0].message.content});
  } catch (error) {
    console.error("Error processing chat message:", error);
    res.status(500).json({error: "Failed to process chat message"});
  }

});

