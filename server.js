const express = require("express");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

const clients = new Map();

app.get("/", (req, res) => {
  res.send("DINUGRAM Telegram server is running!");
});

app.get("/telegram-status", (req, res) => {
  res.json({
    connected: !!(apiId && apiHash),
    message:
      apiId && apiHash
        ? "Telegram API credentials loaded successfully"
        : "Telegram API credentials are missing"
  });
});

app.post("/send-code", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    const client = new TelegramClient(
      new StringSession(""),
      apiId,
      apiHash,
      { connectionRetries: 5 }
    );

    await client.connect();

    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber,
        apiId,
        apiHash,
        settings: new Api.CodeSettings({})
      })
    );

    clients.set(phoneNumber, {
      client,
      phoneCodeHash: result.phoneCodeHash
    });

    res.json({
      success: true,
      message: "Telegram verification code sent"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DINUGRAM running on port ${PORT}`);
});
