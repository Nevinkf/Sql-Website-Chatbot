import OpenAI from 'openai';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path, { resolve } from 'path';
import sqlite3 from 'sqlite3';

const __dirname = path.resolve();
dotenv.config();
<<<<<<< HEAD
=======
// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'database.db'))

db.run(`CREATE TABLE IF NOT EXISTS test (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT)`);


// db.run("INSERT INTO test (name, email) VALUES (?, ?)", ["Alice", "alice@example.com"], function(err) {
// if (err) {
//   console.error("Insert error:", err);
// } else {
//   console.log("Inserted row with id:", this.lastID);
// }
// });

let dbSchema = "";

db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", [], (err, rows) => {
  if (err) throw err;
  rows.forEach(row => {
    dbSchema += `Table: ${row.name}\nSchema: ${row.sql}\n`;
  });
  resolve(dbSchema);
});

console.log("Database schema loaded:\n", dbSchema);

// AI Setup
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})
let messageHistoryChat = [
  {role: "system", content: "You are an expert SQL summarizer. You will be given the results of an SQL query and you will list and then summarize the results."},
];

let messageHistorySQL = [
  {role: "system", content: `You are an SQL translator. Translate the user's message into an SQL query using the following schema: ${dbSchema}`},
];

console.log(messageHistorySQL[0].content); // Debugging line to check the initial system message
>>>>>>> 9aca24f0fec104f98d2f5d987f91fa5299ef41d0

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'database.db'))

db.run(`CREATE TABLE IF NOT EXISTS test (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT)`);


// db.run("INSERT INTO test (name, email) VALUES (?, ?)", ["Alice", "alice@example.com"], function(err) {
// if (err) {
//   console.error("Insert error:", err);
// } else {
//   console.log("Inserted row with id:", this.lastID);
// }
// });

let dbSchema = "";

db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", [], (err, rows) => {
  if (err) throw err;
  rows.forEach(row => {
    dbSchema += `Table: ${row.name}\nSchema: ${row.sql}\n`;
  });
  resolve(dbSchema);
});

console.log("Database schema loaded:\n", dbSchema);

// AI Setup
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})
let messageHistoryChat = [
  {role: "system", content: "You are an expert SQL summarizer. You will be given the results of an SQL query and you will list and then summarize the results."},
];

let messageHistorySQL = [
  {role: "system", content: `You are an SQL translator. Translate the user's message into an SQL query using the following schema: ${dbSchema}`},
];

console.log(messageHistorySQL[0].content); // Debugging line to check the initial system message

// Server setup 
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
    const sqlQuery = await convertMessageIntoSQL(message);
    const dbResponse = JSON.stringify(await queryDatabase(sqlQuery));

    messageHistoryChat.push({role: "user", content: message});
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messageHistoryChat
    });
    res.json({reply: response.choices[0].message.content});
  } catch (error) {
    console.error("Error processing chat message:", error);
    res.status(500).json({error: "Failed to process chat message"});
  }

});

async function convertMessageIntoSQL(message) {
  messageHistorySQL.push({role: "user", content: `${message}`});
  const translatedMessage = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: messageHistorySQL
  })

  console.log("Translated SQL Query:", translatedMessage.choices[0].message.content);
  return translatedMessage.choices[0].message.content;
}

function queryDatabase(sqlQuery) {
  return new Promise((resolve, reject) => {
    db.all(sqlQuery, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Function to determine can be turned into a query
function determineIfQuery(message) {

}
<<<<<<< HEAD

function loadDBSchema() {
  return new Promise
}
=======
>>>>>>> 9aca24f0fec104f98d2f5d987f91fa5299ef41d0
