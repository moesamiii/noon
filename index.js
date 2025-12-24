// index.js - COMPLETE VERSION WITH DEBUG LOGGING
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "claude_verify_token_2024";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ---------------------------------------------
// Startup logs
// ---------------------------------------------
console.log("🚀 Server starting...");
console.log("✅ VERIFY_TOKEN loaded:", !!VERIFY_TOKEN);
console.log("✅ WHATSAPP_TOKEN loaded:", !!WHATSAPP_TOKEN);
console.log("✅ PHONE_NUMBER_ID loaded:", PHONE_NUMBER_ID || "❌ Not found");

// ---------------------------------------------
// Global booking memory
// ---------------------------------------------
global.tempBookings = global.tempBookings || {};
const tempBookings = global.tempBookings;

// ---------------------------------------------
// Basic routes (non-webhook)
// ---------------------------------------------
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running on Vercel!");
});

app.get("/dashboard", async (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// ✅ Get bookings from Supabase
app.get("/api/bookings", async (req, res) => {
  try {
    const { getAllBookingsFromSupabase } = require("./databaseHelper");
    const data = await getAllBookingsFromSupabase();
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ---------------------------------------------
// WhatsApp Message Sending Route (WITH IMAGES!)
// ---------------------------------------------
app.post("/sendWhatsApp", async (req, res) => {
  try {
    const { name, phone, service, appointment, image } = req.body;
    console.log("📩 Incoming request to /sendWhatsApp:", req.body);

    if (!name || !phone) {
      console.warn("⚠️ Missing name or phone number");
      return res.status(400).json({ error: "Missing name or phone number" });
    }

    const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n📅 ${appointment}`;
    const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    };

    console.log("📤 Sending message to:", phone);
    console.log("🖼️ Image URL:", image || "No image");

    if (image && image.startsWith("http")) {
      console.log("📤 Sending image message...");

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log("🖼️ Image response:", JSON.stringify(imageData));

      if (!imageResponse.ok || imageData.error) {
        console.error("❌ Image failed:", imageData);

        const textPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body: messageText + "\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن!",
          },
        };

        const textResponse = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(textPayload),
        });

        const textData = await textResponse.json();
        return res.status(200).json({
          success: true,
          fallback: true,
          textData,
          imageError: imageData,
        });
      }

      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: "📞 للحجز أو الاستفسار، تواصل معنا الآن!",
        },
      };

      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(followupPayload),
      });

      console.log("✅ Image message sent successfully to:", phone);
      return res.status(200).json({
        success: true,
        imageData,
        message: "Image sent successfully",
      });
    }

    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: {
        body: messageText + "\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن!",
      },
    };

    const textResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();

    if (!textResponse.ok) {
      console.error("❌ WhatsApp API Error:", textData);
      return res.status(500).json({ success: false, error: textData });
    }

    console.log("✅ Text message sent successfully to:", phone);
    res.status(200).json({ success: true, textData });
  } catch (error) {
    console.error("🚨 Error sending WhatsApp message:", error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// 🔍 DEBUG ENDPOINT - Test if webhook receives anything
// =============================================
app.post("/webhook-test", (req, res) => {
  console.log("🧪 TEST WEBHOOK RECEIVED!");
  console.log("📦 Headers:", JSON.stringify(req.headers, null, 2));
  console.log("📦 Body:", JSON.stringify(req.body, null, 2));

  res.status(200).json({
    success: true,
    message: "Test webhook received",
    body: req.body,
  });
});

// =============================================
// 🔍 GET WEBHOOK - Verification with detailed logging
// =============================================
app.get("/webhook", (req, res) => {
  console.log("=".repeat(60));
  console.log("🔍 WEBHOOK VERIFICATION REQUEST");
  console.log("=".repeat(60));

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("📋 Mode:", mode);
  console.log("📋 Token received:", token);
  console.log("📋 Token expected:", VERIFY_TOKEN);
  console.log("📋 Challenge:", challenge);

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ VERIFICATION SUCCESSFUL!");
    return res.status(200).send(challenge);
  }

  console.log("❌ VERIFICATION FAILED!");
  return res.sendStatus(403);
});

// =============================================
// 🔍 POST WEBHOOK - Enhanced with detailed logging
// =============================================
app.post("/webhook", async (req, res) => {
  console.log("=".repeat(60));
  console.log("🔔 WEBHOOK POST RECEIVED AT:", new Date().toISOString());
  console.log("=".repeat(60));

  console.log("📋 Request Headers:");
  console.log(JSON.stringify(req.headers, null, 2));

  console.log("📋 Request Body:");
  console.log(JSON.stringify(req.body, null, 2));

  console.log("📋 Request Query:");
  console.log(JSON.stringify(req.query, null, 2));

  try {
    const body = req.body;

    // Log the entire structure
    console.log("🔍 Checking body.entry:", body.entry);
    console.log("🔍 Checking body.entry[0]:", body.entry?.[0]);
    console.log("🔍 Checking changes:", body.entry?.[0]?.changes);
    console.log("🔍 Checking value:", body.entry?.[0]?.changes?.[0]?.value);
    console.log(
      "🔍 Checking messages:",
      body.entry?.[0]?.changes?.[0]?.value?.messages
    );

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;

    if (!message) {
      console.log("⚠️ No message found - might be status update");
      console.log("📦 Full body:", JSON.stringify(body, null, 2));
      return res.sendStatus(200);
    }

    console.log("✅ MESSAGE FOUND!");
    console.log("📨 From:", message.from);
    console.log("📨 Type:", message.type);
    console.log("📨 Text:", message.text?.body);

    const from = message.from;
    const text = message.text?.body?.trim() || "";

    // Simple test response
    if (
      text.toLowerCase().includes("hi") ||
      text.toLowerCase().includes("hello") ||
      text.toLowerCase().includes("مرحبا")
    ) {
      console.log("👋 Greeting detected - sending response");

      const { sendTextMessage } = require("./helpers");
      await sendTextMessage(
        from,
        "مرحبا! أنا هنا للمساعدة 👋\nHello! I'm here to help!"
      );
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    console.error("❌ Stack:", err.stack);
    return res.sendStatus(500);
  }
});

// ---------------------------------------------
// Run Server
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

module.exports = app;
