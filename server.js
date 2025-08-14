import OpenAI from 'openai';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import sqlite3 from 'sqlite3';

const __dirname = path.resolve();
dotenv.config();

// Initialize SQLite database connection
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));
let dbSchema = "";
const PORT = process.env.PORT || 3001;
const app = express();

// Register middleware before rout4es
app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

// Message histories for SQL translation and summarization
let messageHistory = [];
let messageHistorySQL = [];

// Load the database schema at startup, then intialize message histories
loadDBSchema().then((schema) => {
  dbSchema = schema;
  // Initialize message histories with loaded schema
  messageHistorySQL = [
    {role: "system", content: `You are an expert SQL translator. You will be given a natural language request and you will translate it into an SQL query for the following database schema:\n\n${JSON.stringify(dbSchema)}, your response will only contain sql code, no explanations or comments.`}
  ];
  messageHistory = [
    {role: "system", content: "You are an expert SQL query results summarizer. Given the SQL query executed and its results or status, list and summarize the results. If the query was retrieving information, summarize the returned rows. If the query added, removed, or modified tables, columns, or rows, state whether the operation was successful."}
  ];

  // Start the server after loading the schema
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
});

// AI Setup
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})

// Proccess chat messages
app.post('/api/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "No message provided in request body" });
  }
  try {
    const sqlQuery = await convertMessageIntoSQL(message);
    const queryType = await determineQueryType(sqlQuery);
    let dbResponse;

    // Depending on the type of SQL query, execute it and handle the response
    if (queryType === "SELECT") {
      dbResponse = JSON.stringify(await queryDatabase(sqlQuery));
    } else if (queryType === "INSERT" || queryType === "UPDATE" || queryType === "DELETE") {
      dbResponse = await runDatabase(sqlQuery);
    } else {
      dbRepsonse = await runDatabase(sqlQuery);
    }

    // After each query, reload the schema and update the system prompt
    dbSchema = await loadDBSchema();
    // Replace the first system message in messageHistorySQL with the new schema
    if (messageHistorySQL.length > 0 && messageHistorySQL[0].role === "system") {
      messageHistorySQL[0].content = `You are an expert SQL translator. You will be given a natural language request and you will translate it into an SQL query for the following database schema:\n\n${JSON.stringify(dbSchema)}, your response will only contain sql code, no explanations or comments.`;
    }
  
    // Summarize the SQL query results
    const sqlSummary = await summarizeSQLQueryResults(sqlQuery, dbResponse);
    console.log(messageHistorySQL.length, messageHistory.length);
    res.json({reply: sqlSummary});
  } catch (error) {
    console.error("Error processing chat message:", error);
    res.status(500).json({error: "Failed to process chat message"});
  }
});

/**
 * Convert a natural language message into an SQL query using OpenAI's GPT model.
 * @param {*} message Chat message from the user.
 * @returns Translated SQL query as a string.
 */
async function convertMessageIntoSQL(message) {
  trimHistoryPairs(messageHistorySQL, 5); // Keep the last 5 pairs of user and assistant messages
  messageHistorySQL.push({role: "user", content: `${message}`});
  const translatedMessage = await openai.chat.completions.create({
    model: "gpt-5",
    messages: messageHistorySQL
  })
  messageHistorySQL.push({role: "assistant", content: translatedMessage.choices[0].message.content});

  console.log("Translated SQL Query:", translatedMessage.choices[0].message.content);
  return translatedMessage.choices[0].message.content;
}

/**
 * Summarize the results of an SQL query using OpenAI's GPT model.
 * @param {*} sqlQuery SQL query that was executed, used for context.
 * @param {*} results Results from the SQL query execution, can be rows or status of the operation.
 * @returns Summary of the SQL query results as a string.
 */
async function summarizeSQLQueryResults(sqlQuery, results) {
  trimHistoryPairs(messageHistory, 5); // Keep the last 5 pairs of user and assistant messages
  messageHistory.push({role: "user", content: `SQL Query: ${sqlQuery}\n\nResults: ${results}`});
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: messageHistory
  });
  messageHistory.push({role: "assistant", content: response.choices[0].message.content});
  return response.choices[0].message.content;
}

/**
 * Trim the message history to keep only the most recent pairs of user and assistant messages.
 * This helps to manage the context size for the AI model.
 * @param {*} history Message history array to trim.
 * @param {*} maxPairs Amount of user-assistant pairs to keep in the history.
 */
function trimHistoryPairs(history, maxPairs) {
  const allowedPairs = 1 + (maxPairs * 2);
  while (history.length > allowedPairs) {
    history.splice(1, 2); // Remove the oldest user and assistant messages
  }
}

/**
 * Determine the type of SQL query based on its content.
 * @param {*} sqlQuery SQL query string to analyze.
 * @returns String that indicates the type of SQL query (e.g., SELECT, INSERT, UPDATE, DELETE, DDL).
 */
async function determineQueryType(sqlQuery) {
  const lowerQuery = sqlQuery.toLowerCase();
  if (lowerQuery.startsWith("select")) {
    return "SELECT";
  } else if (lowerQuery.startsWith("insert")) {
    return "INSERT";
  } else if (lowerQuery.startsWith("update")) {
    return "UPDATE";
  } else if (lowerQuery.startsWith("delete")) {
    return "DELETE";
  } else if (lowerQuery.startsWith("create") || lowerQuery.startsWith("drop") || lowerQuery.startsWith("alter")) {
    return "DDL"; // Data Definition Language
  } else {
    return "UNKNOWN";
  }
}


/**
 * Query the database with the provided SQL query.
 * @param {*} sqlQuery SQL query string to execute.
 * @returns Promise that resolves with the query results or rejects with an error.
 */
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

/**
 * Run a SQL command that modifies the database (INSERT, UPDATE, DELETE).
 * This function does not return any rows, only the number of changes made.
 * @param {*} sqlQuery SQL command to execute.
 * @returns Promise that resolves with the number of changes made or rejects with an error.
 */
function runDatabase(sqlQuery) {
  return new Promise((resolve, reject) => {
    db.run(sqlQuery, [], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({changes: this.changes});
      }
    });
  });
}

/**
 * Loads DB Schema from the SQLite database, so that AI can use it to generate SQL queries.
 * @returns Promise that resolves with the database schema as a string.
 */
async function loadDBSchema() {
  return new Promise((resolve, reject) => {
    db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        let schema = "";
        rows.forEach(row => {
          schema += `Table: ${row.name}\nSchema: ${row.sql}\n`;
        });
        resolve(schema);
      }
    });
  });
}
