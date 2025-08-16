const openButton = document.getElementById("toggleChat");
const sendButton = document.getElementById("sendButton");
const userInput = document.getElementById("userInput");
const chatMessages = document.getElementById("chatMessages"); // Container for chat messages

openButton.addEventListener("click", () => {
  let chatWindow = document.getElementById("chatContainer");
  if (chatWindow.style.display === "none" || chatWindow.style.display === "") {
    chatWindow.style.display = "block";
  } else {
    chatWindow.style.display = "none";
  }
})

sendButton.addEventListener("click", async () => {
  const message = userInput.value.trim();

  if (!message) return; // Ignore empty messages

  chatMessages.innerHTML += `<div class="user-message">${message}</div>`;

  const response = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({message})
  });

  const data = await response.json();

  if (!response.ok) {
    displayError(data?.reply || `Request failed with status ${response.status}`);
  } else {
    displayResponse(data?.reply ?? "No response from server");
  }
})

/**
 * Display the response from the server in the chat messages container.
 * @param {*} response Response text from the server.
 */
function displayResponse(response) { 
  chatMessages.innerHTML += `<div class="bot-message">${response}</div>`;
}

/**
 * Display an error message in the chat messages container.
 * This function is used to show errors that occur during the chat process.
 * @param {*} error Error message fromo the server to display.
 */
function displayError(error) {
  chatMessages.innerHTML += `<div class="error-message">Error: ${error}</div>`;
}