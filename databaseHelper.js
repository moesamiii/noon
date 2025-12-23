const { createClient } = require("@supabase/supabase-js");

// ==============================================
// Create Supabase inside a function (fix Vercel)
// ==============================================
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// ==============================================
// Normalize phone (do NOT remove leading zero)
// ==============================================
function normalizePhone(phone) {
  if (!phone) return "";
  return phone.toString().replace(/\D/g, "");
}

// ==============================================
// Save NEW booking into Supabase
// ==============================================
async function insertBookingToSupabase(booking) {
  try {
    console.log(
      "🔑 SUPABASE_SERVICE_KEY:",
      process.env.SUPABASE_SERVICE_KEY ? "Loaded" : "❌ NOT LOADED"
    );

    const supabase = getSupabase();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("bookings")
      .insert([
        {
          name: booking.name,
          phone: booking.phone,
          service: booking.service,
          appointment: booking.appointment,
          time: now,
          status: "new",
        },
      ])
      .select();

    if (error) {
      console.error("❌ Supabase insert error:", error.message);
      return null;
    }

    console.log("✅ Saved to Supabase:", data);
    return data;
  } catch (err) {
    console.error("❌ Unexpected Supabase insert error:", err.message);
    return null;
  }
}

// ==============================================
// Find last booking by phone
// ==============================================
async function findLastBookingByPhone(rawPhone) {
  try {
    const supabase = getSupabase();
    const normalized = normalizePhone(rawPhone);

    console.log("📌 Searching for phone:", normalized);

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return null;
    }

    if (data && data.length > 0) return data[0];
    return null;
  } catch (err) {
    console.error("❌ Unexpected Supabase find error:", err.message);
    return null;
  }
}

// ==============================================
// Update booking - cancel
// ==============================================
async function updateBookingStatus(id, newStatus) {
  try {
    const supabase = getSupabase();

    const { error } = await supabase
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      console.error("❌ Supabase update error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("❌ Unexpected update error:", err.message);
    return false;
  }
}

// ==============================================
// ✅ NEW: Get ALL bookings for dashboard
// ==============================================
async function getAllBookingsFromSupabase() {
  try {
    const supabase = getSupabase();

    console.log("📥 Fetching all bookings from Supabase...");

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Supabase fetch error:", error.message);
      return [];
    }

    console.log(`✅ Retrieved ${data.length} bookings from Supabase`);
    return data;
  } catch (err) {
    console.error("❌ Unexpected fetch error:", err.message);
    return [];
  }
}

// ==============================================
// ✅ UPDATED EXPORTS
// ==============================================
module.exports = {
  findLastBookingByPhone,
  updateBookingStatus,
  insertBookingToSupabase,
  getAllBookingsFromSupabase, // ✅ NEW FUNCTION ADDED
};
