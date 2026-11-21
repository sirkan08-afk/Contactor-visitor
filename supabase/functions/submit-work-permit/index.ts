// Public QR submission + private tracking lookup for Work Permit.
// Public callers can submit/track only; privileged database access stays server-side.
// Configure [functions.submit-work-permit] verify_jwt = false in supabase/config.toml.
import { createClient } from "npm:@supabase/supabase-js@2";

const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    console.error("Missing TURNSTILE_SECRET_KEY");
    return { ok: false, status: 500, message: "ระบบยืนยันความปลอดภัยยังไม่ได้ตั้งค่า" };
  }
  if (!token) return { ok: false, status: 400, message: "กรุณายืนยันความปลอดภัยก่อนดำเนินการ" };

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }),
  });
  if (!response.ok) {
    return { ok: false, status: 503, message: "บริการยืนยันความปลอดภัยไม่พร้อมใช้งาน" };
  }
  const result = await response.json();
  if (result.success !== true || result.hostname !== "sirkan08-afk.github.io") {
    return { ok: false, status: 403, message: "การยืนยันความปลอดภัยไม่สำเร็จ กรุณาลองใหม่" };
  }
  return { ok: true, status: 200, message: "" };
}

const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const secretKey = secretKeys.default;
if (!supabaseUrl || !secretKey) throw new Error("Missing Supabase URL or default secret key");
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

async function enforceRateLimit(req: Request, action: "track" | "submit") {
  const salt = Deno.env.get("RATE_LIMIT_SALT");
  if (!salt) {
    console.error("Missing RATE_LIMIT_SALT");
    return { allowed: false, configured: false };
  }
  const ipHeader = req.headers.get("cf-connecting-ip");
  if (!ipHeader || !ipHeader.trim()) {
    // Do not put every visitor into one shared bucket when the trusted proxy header is absent.
    console.error("Missing trusted cf-connecting-ip header; rate limiting cannot identify the client");
    return { allowed: false, configured: false };
  }
  const ip = clean(ipHeader, 100);
  const ipHash = await sha256(salt + ":" + ip);
  const windowSeconds = 600;
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
  const maxRequests = action === "track" ? 10 : 5;
  const { data, error } = await admin.rpc("consume_work_permit_public_limit", {
    p_ip_hash: ipHash,
    p_window_start: windowStart,
    p_max_requests: maxRequests,
  });
  if (error) {
    console.error("Rate limit RPC failed", error);
    return { allowed: false, configured: true };
  }
  return { allowed: data === true, configured: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, 400);
    }
    const payload = body as Record<string, unknown>;
    const action = clean(payload.action, 20);
    if (action !== "track" && action !== "submit") return json({ error: "Unknown action" }, 400);

    // Require a fresh Turnstile token for BOTH public tracking and public submissions.
    const token = clean(payload.turnstile_token ?? payload["cf-turnstile-response"], 2048);
    const captcha = await verifyTurnstile(token);
    if (!captcha.ok) return json({ error: captcha.message }, captcha.status);

    const limit = await enforceRateLimit(req, action);
    if (!limit.configured) return json({ error: "ระบบจำกัดการใช้งานยังไม่ได้ตั้งค่า" }, 503);
    if (!limit.allowed) return json({ error: "มีการใช้งานบ่อยเกินไป กรุณารอ 10 นาทีแล้วลองใหม่" }, 429);

    const db = admin;

    if (action === "track") {
      const rawPermitNo = String(payload.permit_no ?? "").trim();
      if (rawPermitNo.length > 60) return json({ error: "รูปแบบเลข Work Permit ไม่ถูกต้อง" }, 400);
      const permitNo = rawPermitNo.toUpperCase();
      if (!/^WP-[A-Z0-9-]{6,30}$/.test(permitNo)) return json({ error: "รูปแบบเลข Work Permit ไม่ถูกต้อง" }, 400);
      const { data: permit, error } = await db.from("work_permits")
        .select("id,permit_no,status,work_title")
        .eq("permit_no", permitNo).maybeSingle();
      if (error) throw error;
      if (!permit) return json({ error: "ไม่พบเลข Work Permit นี้" }, 404);
      const { data: approvals, error: approvalError } = await db.from("work_permit_department_approvals")
        .select("department,status,acted_at").eq("permit_id", permit.id).eq("department", "SECURITY");
      if (approvalError) throw approvalError;
      return json({
        permit: { permit_no: permit.permit_no, status: permit.status, work_title: permit.work_title },
        approvals: (approvals ?? []).map((item) => ({
          department: item.department,
          status: item.status,
          acted_at: item.acted_at,
        })),
      });
    }

    const applicant = clean(payload.applicant_name, 160);
    const supervisor = clean(payload.supervisor_name, 160);
    const company = clean(payload.company_name, 180);
    const phone = clean(payload.contact_phone, 40);
    const title = clean(payload.work_title, 180);
    const location = clean(payload.work_location, 180);
    const startDate = clean(payload.start_date, 10);
    const endDate = clean(payload.end_date, 10);
    const teamSize = Number(payload.team_size);
    const validDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(value + "T00:00:00Z");
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const rawStartTime = String(payload.start_time ?? "").trim();
    const rawEndTime = String(payload.end_time ?? "").trim();
    if (!applicant || !supervisor || !company || !phone || !title || !location ||
        !validDate(startDate) ||
        (endDate && (!validDate(endDate) || endDate < startDate)) ||
        (rawStartTime && !timePattern.test(rawStartTime)) ||
        (rawEndTime && !timePattern.test(rawEndTime)) ||
        !Number.isInteger(teamSize) || teamSize < 1 || teamSize > 200) {
      return json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบและตรวจสอบวันที่ เวลา และจำนวนคน" }, 400);
    }

    const type = clean(payload.work_type, 500);
    const typeText = (type + " " + title).toLowerCase();
    const typeCode = /ไฟฟ้า|electrical/.test(typeText) ? "ELE" :
      /เชื่อม|weld/.test(typeText) ? "WLD" :
      /ตัด|เจียร|cut|grind/.test(typeText) ? "CUT" :
      /ที่สูง|นั่งร้าน|height/.test(typeText) ? "HGT" :
      /อับอากาศ|confined/.test(typeText) ? "CSP" :
      /ขุด|เจาะ|excavat|drill/.test(typeText) ? "EXC" :
      /ทาสี|paint/.test(typeText) ? "PNT" :
      /ทำความสะอาด|clean/.test(typeText) ? "CLN" : "GEN";
    const { data: generatedPermitNo, error: numberError } = await db.rpc("next_work_permit_no", { p_type_code: typeCode });
    if (numberError || !generatedPermitNo) throw numberError || new Error("Cannot generate Work Permit number");
    const permitNo = generatedPermitNo as string;
    const trackingCode = crypto.randomUUID() + crypto.randomUUID();
    const trackingHash = await sha256(trackingCode);

    const { data: permit, error } = await db.from("work_permits").insert({
      permit_no: permitNo,
      company_name: company,
      work_title: title,
      work_description: clean(payload.work_description, 4000),
      department: clean(payload.department, 100),
      work_location: location,
      start_date: startDate,
      end_date: endDate || null,
      start_time: rawStartTime || null,
      end_time: rawEndTime || null,
      team_size: teamSize,
      status: "submitted",
      created_by: null,
      contact_name: applicant,
      contact_phone: phone,
      applicant_name: applicant,
      supervisor_name: supervisor,
      work_type: type,
      tools: clean(payload.tools, 2000),
      tracking_code_hash: trackingHash,
    }).select("id,permit_no").single();
    if (error) throw error;

    const workerNames = Array.isArray(payload.worker_names)
      ? payload.worker_names.map((name: unknown) => clean(name, 160)).filter(Boolean).slice(0, teamSize)
      : [];
    if (workerNames.length) {
      const workerRows = workerNames.map((full_name: string) => ({
        permit_id: permit.id,
        full_name,
      }));
      const { error: workerError } = await db.from("work_permit_workers").insert(workerRows);
      if (workerError) {
        const { error: rollbackError } = await db.from("work_permits").delete().eq("id", permit.id);
        if (rollbackError) console.error("Failed to roll back permit after worker insert error", rollbackError);
        throw workerError;
      }
    }

    const { error: routeError } = await db.from("work_permit_department_approvals").insert([{
      permit_id: permit.id,
      department: "SECURITY",
      status: "pending",
    }]);
    if (routeError) {
      const { error: rollbackError } = await db.from("work_permits").delete().eq("id", permit.id);
      if (rollbackError) console.error("Failed to roll back permit after approval insert error", rollbackError);
      throw routeError;
    }
    return json({ success: true, permit_no: permit.permit_no, tracking_code: trackingCode, status: "submitted" }, 201);
  } catch (error) {
    console.error("submit-work-permit:", error);
    return json({ error: "ไม่สามารถดำเนินการได้ กรุณาตรวจการตั้งค่าระบบหรือลองใหม่" }, 500);
  }
});
