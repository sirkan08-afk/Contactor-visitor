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

const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const secretKey = secretKeys.default;
if (!supabaseUrl || !secretKey) throw new Error("Missing Supabase URL or default secret key");
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const db = admin;

    if (body.action === "track") {
      const permitNo = clean(body.permit_no, 60);
      const trackingCode = clean(body.tracking_code, 120);
      if (!permitNo || trackingCode.length < 20) return json({ error: "ข้อมูลติดตามไม่ถูกต้อง" }, 400);
      const tokenHash = await sha256(trackingCode);
      const { data: permit, error } = await db.from("work_permits")
        .select("id,permit_no,status,work_title,company_name,start_date,work_location")
        .eq("permit_no", permitNo).eq("tracking_token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      if (!permit) return json({ error: "ไม่พบคำขอ หรือรหัสติดตามไม่ถูกต้อง" }, 404);
      const { data: approvals, error: approvalError } = await db.from("work_permit_department_approvals")
        .select("department,status,comment,acted_at").eq("permit_id", permit.id);
      if (approvalError) throw approvalError;
      return json({ permit, approvals: approvals ?? [] });
    }

    if (body.action !== "submit") return json({ error: "Unknown action" }, 400);
    const applicant = clean(body.applicant_name, 160);
    const supervisor = clean(body.supervisor_name, 160);
    const company = clean(body.company_name, 180);
    const phone = clean(body.contact_phone, 40);
    const title = clean(body.work_title, 180);
    const location = clean(body.work_location, 180);
    const startDate = clean(body.start_date, 10);
    const endDate = clean(body.end_date, 10);
    const teamSize = Number(body.team_size);
    if (!applicant || !supervisor || !company || !phone || !title || !location ||
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) ||
        !Number.isInteger(teamSize) || teamSize < 1 || teamSize > 200) {
      return json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบและตรวจสอบจำนวนคน" }, 400);
    }

    const trackingCode = crypto.randomUUID() + crypto.randomUUID();
    const trackingHash = await sha256(trackingCode);
    const permitNo = "WP-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") +
      "-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const type = clean(body.work_type, 100);
    const ownerDepartment = clean(body.department, 100).toUpperCase().replaceAll(" ", "_");
    const departments = new Set<string>(["SECURITY"]);
    if (/ไฟฟ้า|เชื่อม|hot|ที่สูง|อับ|confined|electrical/i.test(type)) departments.add("SAFETY");
    if (/ซ่อม|ไฟฟ้า|เชื่อม|เครื่อง|maintenance|electrical/i.test(type)) departments.add("ENGINEERING");
    const knownOwners = new Set(["ENGINEERING", "HOUSEKEEPING", "F&B", "FRONT_OFFICE"]);
    if (knownOwners.has(ownerDepartment)) departments.add(ownerDepartment);

    const { data: permit, error } = await db.from("work_permits").insert({
      permit_no: permitNo,
      company_name: company,
      work_title: title,
      work_description: clean(body.work_description, 4000),
      department: clean(body.department, 100),
      work_location: location,
      start_date: startDate,
      end_date: endDate || null,
      start_time: clean(body.start_time, 5) || null,
      end_time: clean(body.end_time, 5) || null,
      team_size: teamSize,
      status: "submitted",
      created_by: null,
      contact_name: applicant,
      contact_phone: phone,
      applicant_name: applicant,
      supervisor_name: supervisor,
      work_type: type,
      tools: clean(body.tools, 2000),
      tracking_token_hash: trackingHash,
    }).select("id,permit_no").single();
    if (error) throw error;

    const approvalRows = [...departments].map((department) => ({
      permit_id: permit.id, department, status: "pending",
    });
    const { error: routeError } = await db.from("work_permit_department_approvals").insert(approvalRows);
    if (routeError) {
      await db.from("work_permits").delete().eq("id", permit.id);
      throw routeError;
    }
    return json({ success: true, permit_no: permit.permit_no, tracking_code: trackingCode, status: "submitted" }, 201);
  } catch (error) {
    console.error("submit-work-permit:", error);
    return json({ error: "ไม่สามารถดำเนินการได้ กรุณาตรวจการตั้งค่าระบบหรือลองใหม่" }, 500);
  }
}));
