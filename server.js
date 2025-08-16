import OpenAI from 'openai';
import dotenv from 'dotenv';
import express, { raw } from 'express';
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
    const messageIntent = await classifyMessageIntent(message);
    if (messageIntent === "NOT_DATABASE_QUERY") {
      // If the message is not a database query, state generic response.
      return res.json({ reply: "This is not a database query. Please ask a question about the database." });
    }

    const rawSQLQuery = await convertMessageIntoSQL(message);
    const sqlQuery = stripMarkdownCodeBlock(rawSQLQuery);
    console.log("Translated Message: ", sqlQuery);

    const queryType = await determineQueryType(sqlQuery);
    let dbResponse;

    try { 
       if (queryType === "SELECT") {
        dbResponse = await queryDatabase(sqlQuery);
      } else if (queryType === "INSERT" || queryType === "UPDATE" || queryType === "DELETE") {
        dbResponse = await runDatabase(sqlQuery);
      } else {
        dbResponse = await runDatabase(sqlQuery);
      }

    } catch (dbError) {
      // Try summaizer to provide feedback on the error
      const errorSummary = await summarizeSQLQueryResults(sqlQuery, dbError.message);
      return res.status(400).json({
        error: dbError.message,
        details: dbError.code || "SQLITE_ERROR",
        reply: errorSummary
      });
    }

    // After each query, reload the schema and update the system prompt
    dbSchema = await loadDBSchema();
    // Replace the first system message in messageHistorySQL with the new schema
    if (messageHistorySQL.length > 0 && messageHistorySQL[0].role === "system") {
      messageHistorySQL[0].content = `You are an expert SQL translator. You will be given a natural language request and you will translate it into an SQL query for the following database schema:\n\n${JSON.stringify(dbSchema)}, your response will only contain sql code, no explanations or comments.`;
    }
  
    // Summarize the SQL query results
    const sqlSummary = await summarizeSQLQueryResults(sqlQuery, JSON.stringify(dbResponse));
    res.json({reply: sqlSummary});
  } catch (error) {
    console.error("Error processing chat message:", error);
    res.status(500).json({error: "Failed to process chat message"});
  }
});

/**
 * Strip Markdown code block syntax from the raw SQL query, so that it can be executed directly.
 * This function removes the leading and trailing code fences (```) and any optional language labels.
 * @param {*} rawSQLQuery Raw SQL query string that may contain Markdown code block syntax.
 * @returns Cleaned SQL query string without Markdown syntax.
 */
function stripMarkdownCodeBlock(rawSQLQuery) {
  // Remove leading/trailing code fences, optional language labels, and trim
  return rawSQLQuery.replace(/^\s*```[\w]*\s*([\s\S]*?)\s*```/gm, '$1').trim();
}

/**
 * Convert a natural language message into an SQL query using OpenAI's GPT model.
 * @param {*} message Chat message from the user.
 * @returns Translated SQL query as a string.
 */
async function convertMessageIntoSQL(message) {
  trimHistoryPairs(messageHistorySQL, 5); // Keep the last 5 pairs of user and assistant messages
  messageHistorySQL.push({role: "user", content: `${message}`});
  const translatedMessage = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messageHistorySQL
  })
  messageHistorySQL.push({role: "assistant", content: translatedMessage.choices[0].message.content});
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
    model: "gpt-4o-mini",
    messages: messageHistory
  });
  messageHistory.push({role: "assistant", content: response.choices[0].message.content});
  return response.choices[0].message.content;
}

/**
 * Determine the type of SQL query based on its content.
 * @param {*} sqlQuery SQL query string to analyze.
 * @returns String that indicates the type of SQL query (e.g., SELECT, INSERT, UPDATE, DELETE, DDL).
 */
function determineQueryType(sqlQuery) {
  const lowerQuery = sqlQuery.trim().toLowerCase();
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
 * Classify the intent of a message to determine if it is a database query or not.
 * Used to filter out non-database related messages.
 * @param {*} message Message text to classify.
 * @returns String indicating the intent: "DATABASE_QUERY" or "NOT_DATABASE_QUERY".
 */
async function classifyMessageIntent(message) {
  const intentPrompt = [
    {role: "system", content: "You are an expert intent classifier. Given a natural language message, identifiy if the message intends to query the database. Reply only with 'DATABASE_QUERY' or 'NOT_DATABASE_QUERY'."},
    {role: "user", content: "Show me all users who signed up last week."},
    {role: "assistant", content: "DATABASE_QUERY"},
    {role: "user", content: "Tell me a joke."},
    {role: "assistant", content: "NOT_DATABASE_QUERY"},
    {role: "user", content: message}
  ]

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: intentPrompt
  });
  return response.choices[0].message.content.trim();
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
 * Query the database with the provided SQL query.
 * @param {*} sqlQuery SQL query string to execute.
 * @returns Promise that resolves with the query results or rejects with an error.
 */
function queryDatabase(sqlQuery) {
  return new Promise((resolve, reject) => {
    db.all(sqlQuery, [], (err, rows) => {
      if (err) {
        return reject(normalizeSqliteError(err, sqlQuery));
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
        return reject(normalizeSqliteError(err, sqlQuery));
      } else {
        resolve({changes: this.changes});
      }
    });
  });
}

/**
 * Normlize SQLite error to include a safe message, code, and the SQL that caused the error.
 * Avoids exposing sensitive information from the database.
 * @param {*} err Error object from SQLite.
 * @param {*} sql Sql query that caused the error.
 * @returns Error object with normalized properties.
 */
function normalizeSqliteError(err, sql) {
  const e = new Error(err.message || "SQLite Error");
  e.code = err.code || "SQLITE_ERROR";
  e.sql = sql;
  return e;
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
