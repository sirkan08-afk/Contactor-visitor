import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function verifyLineSignature(rawBody: string, secret: string, signature: string | null) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  return toBase64(digest) === signature;
}

function classify(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (/^(รับทราบ|ทราบแล้ว|โอเค|ok|okay|ขอบคุณ|ครับ|ค่ะ|👍|🙏)[.!\s]*$/i.test(normalized)) {
    return { category: "general", destination: "ignored", status: "ignored", reason: "acknowledgement" };
  }
  if (normalized.includes("แจ้งเพื่อทราบ")) {
    return { category: "incident", destination: "security_logbook", status: "review_required", reason: "incident_keyword" };
  }
  if (normalized.includes("ตรวจพื้นที่")) {
    return { category: "patrol_notice", destination: "patrol_reference_only", status: "ignored", reason: "patrol_is_qr_source_of_truth" };
  }
  if (normalized.includes("มีผู้รับเหมาเข้าทำ")) {
    return { category: "contractor_notice", destination: "contractor_reference_only", status: "ignored", reason: "contractor_app_is_source_of_truth" };
  }
  return { category: "unknown", destination: "manual_review", status: "review_required", reason: "unclassified_message" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const lineSecret = Deno.env.get("LINE_CHANNEL_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!lineSecret || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server configuration incomplete" }, 503);
  }

  const rawBody = await req.text();
  const valid = await verifyLineSignature(rawBody, lineSecret, req.headers.get("x-line-signature"));
  if (!valid) return json({ error: "Invalid LINE signature" }, 401);

  let payload: { events?: Array<Record<string, any>> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let inserted = 0;
  let ignored = 0;
  for (const event of payload.events || []) {
    if (event.type !== "message" || event.message?.type !== "text") {
      ignored++;
      continue;
    }

    // Only accept group/room messages for the shared Security group.
    const sourceType = event.source?.type;
    if (sourceType !== "group" && sourceType !== "room") {
      ignored++;
      continue;
    }

    const text = String(event.message.text || "").trim();
    if (!text) {
      ignored++;
      continue;
    }
    const result = classify(text);
    if (result.status === "ignored") {
      ignored++;
      continue;
    }

    const row = {
      line_event_id: String(event.webhookEventId || event.message.id),
      line_message_id: String(event.message.id),
      source_type: sourceType,
      source_group_id: event.source?.groupId || event.source?.roomId || null,
      sender_line_user_id: event.source?.userId || null,
      message_text: text,
      line_timestamp: event.timestamp ? new Date(event.timestamp).toISOString() : null,
      category: result.category,
      destination: result.destination,
      status: result.status,
      classification_reason: result.reason,
      raw_event: event,
    };

    const { error } = await supabase.from("line_security_messages").upsert(row, {
      onConflict: "line_event_id",
      ignoreDuplicates: true,
    });
    if (error) {
      console.error("line_security_messages insert failed", error.message);
      return json({ error: "Could not store LINE event" }, 500);
    }
    inserted++;
  }

  return json({ ok: true, inserted, ignored });
});
