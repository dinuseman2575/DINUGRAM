const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

app.get("/", (req, res) => {
  res.send("DINUGRAM Telegram server is running!");
});

app.get("/telegram-status", (req, res) => {
  if (!apiId || !apiHash) {
    return res.status(500).json({
      connected: false,
      message: "Telegram API credentials are missing"
    });
  }

  res.json({
    connected: true,
    message: "Telegram API credentials loaded successfully"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DINUGRAM running on port ${PORT}`);
});
