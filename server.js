const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const fetchImpl =
  typeof fetch === "function"
    ? fetch.bind(globalThis)
    : (...args) => import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));

const app = express();
const PORT = Number(process.env.PORT || 5000);
const DATA_FILE = path.join(__dirname, "data", "incidents.json");
const NOTICE_FILE = path.join(__dirname, "data", "notice.json");
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const NOTICE_ADMIN_PASSWORD = process.env.NOTICE_ADMIN_PASSWORD || "leader_yang";
const ALLOW_INSECURE_TLS =
  String(process.env.SLACK_ALLOW_INSECURE_TLS || "").toLowerCase() === "true";
const ALLOW_SIMULATED_SEND =
  String(process.env.ALLOW_SIMULATED_SEND || "").toLowerCase() === "true";

app.use(express.json());
app.use(express.static(__dirname));

function formatDateTime(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatIncidentMessage(incident) {
  return [
    `1. 장애 제목: ${incident.category}`,
    `2. 장애 현상: ${incident.symptom}`,
    `3. 대상 고객: ${incident.customer}`,
    `4. 장애 시스템: ${incident.issueSystem}`,
    `5. 발생시간: ${incident.occurredAt}`,
    `6. 장애 원인: ${incident.cause || "미정"}`,
    `7. 진행 경과: ${incident.progressText || "없음"}`
  ].join("\n");
}

function buildSlackPayload(incident) {
  const sentText = formatIncidentMessage(incident);
  return {
    inputs: {
      Ft0AT7FYKW6A__3f755ff93b3359652c0c41a5dacbf17b: incident.category,
      Ft0AT7FYKW6A__daf99bd5abaa0c8ef35d536fce0a2e85: incident.symptom,
      Ft0AT7FYKW6A__a7677c938cb5706d99628cd8a6ef1170: incident.customer,
      Ft0AT7FYKW6A__712e21f9ea8c428669c1af2923b1ea2d: incident.issueSystem,
      Ft0AT7FYKW6A__c01954a5d84a92a85a8fcb35f0b40166: incident.occurredAt,
      Ft0AT7FYKW6A__9ee47a669a90e93b95cc56f195ec7971: incident.cause || "미정",
      Ft0AT7FYKW6A__f26317a15c70559db9a8938a0873727f: incident.progressText || ""
    },
    issue_category: incident.category,
    issue_symptom: incident.symptom,
    target_customer: incident.customer,
    issue_system: incident.issueSystem,
    occurred_at: incident.occurredAt,
    issue_cause: incident.cause || "미정",
    progress_text: incident.progressText || "없음",
    text: sentText
  };
}

async function ensureJsonFile(filePath, defaultData) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureJsonFile(DATA_FILE, { incidents: [] });
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeStore(store) {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function readNoticeStore() {
  await ensureJsonFile(NOTICE_FILE, { text: "" });
  const raw = await fs.readFile(NOTICE_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeNoticeStore(store) {
  await fs.writeFile(NOTICE_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function sendToSlack(payload) {
  if (!SLACK_WEBHOOK_URL) {
    if (!ALLOW_SIMULATED_SEND) {
      throw new Error("SLACK_WEBHOOK_URL이 설정되지 않아 실제 슬랙 전송을 할 수 없습니다.");
    }
    console.log("[SLACK_WEBHOOK_URL 미설정] 전송 시뮬레이션 모드");
    console.log(payload.text);
    return { simulated: true, delivered: false };
  }

  if (ALLOW_INSECURE_TLS) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetchImpl(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`슬랙 웹훅 실패 (${response.status}): ${body}`);
  }
  return { simulated: false, delivered: true };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    now: formatDateTime(),
    mode: SLACK_WEBHOOK_URL ? "live" : "simulated",
    webhookConfigured: Boolean(SLACK_WEBHOOK_URL)
  });
});

app.get("/api/notice", async (req, res) => {
  try {
    const store = await readNoticeStore();
    res.json({ text: String(store.text || "") });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "notice read error" });
  }
});

app.post("/api/notice", async (req, res) => {
  try {
    const { password, text } = req.body || {};
    if (String(password || "") !== NOTICE_ADMIN_PASSWORD) {
      return res.status(403).json({ error: "invalid notice admin password" });
    }

    const nextText = String(text || "").trim();
    await writeNoticeStore({ text: nextText, updatedAt: formatDateTime() });
    return res.json({ ok: true, text: nextText });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "notice write error" });
  }
});

app.post("/api/incidents", async (req, res) => {
  try {
    const { category, symptom, customer, issueSystem, occurredAt, cause, progressText } =
      req.body || {};

    if (!category || !String(category).trim()) {
      return res.status(400).json({ error: "장애 제목은 필수입니다." });
    }
    if (!symptom || !String(symptom).trim()) {
      return res.status(400).json({ error: "장애 현상은 필수입니다." });
    }
    if (!issueSystem || !String(issueSystem).trim()) {
      return res.status(400).json({ error: "장애 시스템은 필수입니다." });
    }
    if (!occurredAt || !String(occurredAt).trim()) {
      return res.status(400).json({ error: "발생시간은 필수입니다." });
    }

    const safeCustomer = customer && String(customer).trim() ? String(customer).trim() : "LG 전자";

    const store = await readStore();
    const nextId =
      store.incidents.length > 0
        ? Math.max(...store.incidents.map((item) => Number(item.id) || 0)) + 1
        : 1;

    const incident = {
      id: nextId,
      category: String(category).trim(),
      symptom: String(symptom).trim(),
      customer: safeCustomer,
      issueSystem: String(issueSystem).trim(),
      occurredAt: String(occurredAt).trim(),
      cause: cause && String(cause).trim() ? String(cause).trim() : "미정",
      progressText: progressText && String(progressText).trim() ? String(progressText).trim() : "",
      createdAt: formatDateTime()
    };

    store.incidents.push(incident);
    await writeStore(store);

    const sentText = formatIncidentMessage(incident);
    const slackPayload = buildSlackPayload(incident);
    const delivery = await sendToSlack(slackPayload);

    return res.status(201).json({
      incident,
      sentText,
      mode: delivery.simulated ? "simulated" : "live",
      delivered: Boolean(delivery.delivered)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "서버 오류" });
  }
});

app.listen(PORT, () => {
  console.log(`ERP Dashboard + Incident API listening on http://localhost:${PORT}`);
});
