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

  chatMessages.innerHTML += `<div class="user-message">${message}</div>`;

  const response = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({message})
  });
  const data = await response.json();
  displayResponse(data.reply);

})

function displayResponse(response) { 
  chatMessages.innerHTML += `<div class="bot-message">${response}</div>`;
}