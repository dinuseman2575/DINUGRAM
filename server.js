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
let activeSession = null;


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
activeSession = client;
    

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

app.get("/chats", async (req, res) => {
  try {
    if (!activeSession) {
      return res.status(401).send("Please login to Telegram first.");
    }

    const dialogs = await activeSession.getDialogs({ limit: 30 });

    const chatItems = dialogs.map((dialog) => {
      const name = dialog.title || dialog.name || "Unknown";
      const unread = dialog.unreadCount || 0;
      const firstLetter = name.charAt(0).toUpperCase();

      return `
  <a href="/chat/${dialog.id}/view" class="chat" style="text-decoration:none;color:inherit;">
    <div class="avatar">${firstLetter}</div>
    <div class="info">
      <div class="name">${name}</div>
      <div class="message">Telegram conversation</div>
    </div>
    ${unread > 0 ? `<div class="unread">${unread}</div>` : ""}
  </a>
`;
    }).join("");

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>DINUGRAM</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #ffffff;
          }

          .header {
            padding: 18px;
            font-size: 22px;
            font-weight: bold;
            border-bottom: 1px solid #ddd;
            position: sticky;
            top: 0;
            background: white;
          }

          .chat {
            display: flex;
            align-items: center;
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
          }

          .avatar {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: #3390ec;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            font-weight: bold;
            margin-right: 12px;
          }

          .info {
            flex: 1;
            min-width: 0;
          }

          .name {
            font-size: 17px;
            font-weight: bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .message {
            color: #777;
            margin-top: 5px;
            font-size: 14px;
          }

          .unread {
            background: #3390ec;
            color: white;
            border-radius: 20px;
            min-width: 25px;
            padding: 5px 8px;
            text-align: center;
            font-size: 12px;
          }
        </style>
      </head>

      <body>
        <div class="header">DINUGRAM</div>
        ${chatItems}
      </body>
      </html>
    `);

  } catch (error) {
    console.error("Chats error:", error);
    res.status(500).send("Could not load Telegram chats.");
  }
});


app.get("/chat/:id", async (req, res) => {
  try {
    if (!activeSession) {
      return res.status(401).send("Please login to Telegram first.");
    }

    const chatId = req.params.id;

    const messages = await activeSession.getMessages(chatId, {
      limit: 30
    });

    res.json(
      messages.map((message) => ({
        id: message.id,
        text: message.message || "",
        date: message.date
      }))
    );
  } catch (error) {
    console.error("Messages error:", error);
    res.status(500).send("Could not load messages.");
  }
});


app.get("/chat/:id/view", async (req, res) => {
  try {
    if (!activeSession) {
      return res.status(401).send("Please login to Telegram first.");
    }

    const chatId = req.params.id;
const entity = await activeSession.getEntity(chatId);

const chatName =
  entity.title ||
  [entity.firstName, entity.lastName].filter(Boolean).join(" ") ||
  entity.username ||
  "DINUGRAM";
    const messages = await activeSession.getMessages(chatId, {
      limit: 30
    });

    const messageItems = messages
  .slice()
  .reverse()
  .map((message) => {
    const text = message.message || "";
    const mine = message.out === true;

    return `
      <div style="
        display:flex;
        justify-content:${mine ? "flex-end" : "flex-start"};
        margin:8px 10px;
      ">
        <div style="
          max-width:75%;
          padding:9px 12px;
          border-radius:14px;
          background:${mine ? "#d9fdd3" : "#ffffff"};
          box-shadow:0 1px 2px rgba(0,0,0,.15);
          font-family:Arial,sans-serif;
          font-size:16px;
          word-wrap:break-word;
        ">
          ${text}
        </div>
      </div>
    `;
  })
  .join("");

    res.send(`
     <!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DINUGRAM</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;
  font-family:Arial,sans-serif;
  background:#e7ebee;
}
.header{
  position:fixed;
  top:0;
  left:0;
  right:0;
  height:60px;
  background:#3390ec;
  color:white;
  display:flex;
  align-items:center;
  padding:0 15px;
  font-size:20px;
  font-weight:bold;
  z-index:10;
}
.back{
  margin-right:15px;
  color:white;
  text-decoration:none;
  font-size:28px;
}
.messages{
  padding:75px 5px 85px;
}
.composer{
  position:fixed;
  bottom:0;
  left:0;
  right:0;
  background:white;
  padding:8px;
  display:flex;
  gap:8px;
  border-top:1px solid #ddd;
}
.composer input{
  flex:1;
  border:1px solid #ddd;
  border-radius:22px;
  padding:12px 15px;
  font-size:16px;
  outline:none;
}
.composer button{
  border:0;
  border-radius:50%;
  width:45px;
  height:45px;
  background:#3390ec;
  color:white;
  font-size:20px;
}
</style>
</head>
<body>

<div class="header">
  <a class="back" href="/chats">‹</a>
  ${chatName}
</div>

<div class="messages">
  ${messageItems}
</div>

<form class="composer" action="/chat/${chatId}/send" method="POST">
  <input
    type="text"
    name="message"
    placeholder="Message"
    autocomplete="off"
    required
  >
  <button type="submit">➤</button>
</form>

</body>
</html> 
    `);
  } catch (error) {
    console.error("Chat view error:", error);
    res.status(500).send("Could not load chat.");
  }
});


app.post("/chat/:id/send", async (req, res) => {
  try {
    if (!activeSession) {
      return res.status(401).send("Please login to Telegram first.");
    }

    const chatId = req.params.id;
    const message = req.body.message;

    await activeSession.sendMessage(chatId, {
      message: message
    });

    res.redirect(`/chat/${chatId}/view`);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).send("Could not send message.");
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DINUGRAM running on port ${PORT}`);
});
