/**
 * webhookHandler.js (FINAL FIXED VERSION WITH LOGGING)
 *
 * Responsibilities:
 * - Verify webhook
 * - Receive WhatsApp messages
 * - Detect intents (location / offers / doctors / booking / cancel)
 * - Handle booking flow
 * - Handle audio transcription
 */

const { askAI, sendTextMessage, sendAppointmentOptions } = require("./helpers");

// ⚠️ FIXED — media functions must come from mediaService.js
const {
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendOffersValidity,
} = require("./mediaService");

// ⚠️ FIXED — ban words functions come from contentFilter.js
const { containsBanWords, sendBanWordsResponse } = require("./contentFilter");

// ✔ detection helpers stay in messageHandlers.js
const {
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isCancelRequest,
  isEnglish,
  isGreeting,
  getGreeting,
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

const {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
} = require("./bookingFlowHandler");

const { askForCancellationPhone, processCancellation } = require("./helpers");

// ---------------------------------------------
// REGISTER WHATSAPP WEBHOOK ROUTES
// ---------------------------------------------
function registerWebhookRoutes(app, VERIFY_TOKEN) {
  // ---------------------------------
  // GET — Verify Webhook
  // ---------------------------------
  app.get("/webhook", (req, res) => {
    console.log("🔍 Webhook verification request received");
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("📋 Verification details:", {
      mode,
      token: token ? "✅" : "❌",
      challenge: challenge ? "✅" : "❌",
    });

    if (mode && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verified successfully!");
      return res.status(200).send(challenge);
    }

    console.log("❌ Webhook verification failed");
    return res.sendStatus(403);
  });

  // ---------------------------------
  // POST — Receive WhatsApp Events
  // ---------------------------------
  app.post("/webhook", async (req, res) => {
    try {
      console.log("🔔 Webhook POST received");
      console.log("📦 Full webhook body:", JSON.stringify(req.body, null, 2));

      const body = req.body;

      const message =
        body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;

      if (!message) {
        console.log(
          "⚠️ No message found in webhook body - likely a status update"
        );
        return res.sendStatus(200);
      }

      console.log("📨 Message detected:", {
        from: message.from,
        type: message.type,
        text: message.text?.body,
        timestamp: message.timestamp,
      });

      const from = message.from;
      const text = message.text?.body?.trim() || null;

      const session = getSession(from);
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // -----------------------------------------------------
      // 🎙️ AUDIO → sent to audio processor
      // -----------------------------------------------------
      if (message.type === "audio") {
        console.log("🎙️ Audio message detected");
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // -----------------------------------------------------
      // 🎛️ INTERACTIVE (Buttons / Lists)
      // -----------------------------------------------------
      if (message.type === "interactive") {
        console.log("🎛️ Interactive message detected");
        await handleInteractiveMessage(message, from, tempBookings);
        return res.sendStatus(200);
      }

      // -----------------------------------------------------
      // 📨 Ignore Non-Text Messages
      // -----------------------------------------------------
      if (!text) {
        console.log("⚠️ Non-text message, ignoring");
        return res.sendStatus(200);
      }

      console.log("💬 Processing text message:", text);

      // -----------------------------------------------------
      // 👋 Greeting detection
      // -----------------------------------------------------
      if (isGreeting(text)) {
        console.log("👋 Greeting detected");
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      // -----------------------------------------------------
      // 🚫 Ban Words
      // -----------------------------------------------------
      if (containsBanWords(text)) {
        console.log("🚫 Ban words detected");
        const lang = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, lang);

        delete tempBookings[from];
        session.waitingForCancelPhone = false;

        return res.sendStatus(200);
      }

      // -----------------------------------------------------
      // 🌍 LOCATION
      // -----------------------------------------------------
      if (isLocationRequest(text)) {
        console.log("🌍 Location request detected");
        const lang = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, lang);
        return res.sendStatus(200);
      }

      // -----------------------------------------------------
      // 🎁 OFFERS
      // -----------------------------------------------------
      if (isOffersRequest(text)) {
        console.log("🎁 Offers request detected");
        session.waitingForOffersConfirmation = true;

        const lang = isEnglish(text) ? "en" : "ar";
        await sendOffersValidity(from, lang);
        return res.sendStatus(200);
      }

      // User confirmed he wants the offers
      if (session.waitingForOffersConfirmation) {
        if (isOffersConfirmation(text)) {
          console.log("✅ Offers confirmation received");
          session.waitingForOffersConfirmation = false;

          const lang = isEnglish(text) ? "en" : "ar";
          await sendOffersImages(from, lang);
          return res.sendStatus(200);
        }

        session.waitingForOffersConfirmation = false;
      }

      // -----------------------------------------------------
      // 👨‍⚕️ DOCTORS
      // -----------------------------------------------------
      if (isDoctorsRequest(text)) {
        console.log("👨‍⚕️ Doctors request detected");
        const lang = isEnglish(text) ? "en" : "ar";
        await sendDoctorsImages(from, lang);
        return res.sendStatus(200);
      }

      // -----------------------------------------------------
      // ❗ CANCEL BOOKING
      // -----------------------------------------------------
      if (isCancelRequest(text)) {
        console.log("❗ Cancel request detected");
        session.waitingForCancelPhone = true;

        delete tempBookings[from];

        await askForCancellationPhone(from);
        return res.sendStatus(200);
      }

      // Waiting for phone number to cancel
      if (session.waitingForCancelPhone) {
        console.log("📞 Processing cancellation phone number");
        const phone = text.replace(/\D/g, "");

        if (phone.length < 8) {
          await sendTextMessage(from, "⚠️ رقم الجوال غير صحيح. حاول مرة أخرى:");
          return res.sendStatus(200);
        }

        session.waitingForCancelPhone = false;
        await processCancellation(from, phone);
        return res.sendStatus(200);
      }

      // -----------------------------------------------------
      // 🗓️ BOOKING FLOW
      // -----------------------------------------------------
      console.log("🗓️ Processing as booking flow");
      await handleTextMessage(text, from, tempBookings);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook Handler Error:", err);
      console.error("❌ Error stack:", err.stack);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
