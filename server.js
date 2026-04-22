const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const dotenv = require("dotenv");
const XLSX = require("xlsx");

dotenv.config();

const fetchImpl =
  typeof fetch === "function"
    ? fetch.bind(globalThis)
    : (...args) => import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));

const app = express();
const PORT = Number(process.env.PORT || 5000);
const DATA_FILE = path.join(__dirname, "data", "incidents.json");
const NOTICE_FILE = path.join(__dirname, "data", "notice.json");
const TEAM_INFO_FILE = path.join(__dirname, "Team Info.xlsx");
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const NOTICE_ADMIN_PASSWORD = process.env.NOTICE_ADMIN_PASSWORD || "leader_yang";
const ALLOW_INSECURE_TLS =
  String(process.env.SLACK_ALLOW_INSECURE_TLS || "").toLowerCase() === "true";
const ALLOW_SIMULATED_SEND =
  String(process.env.ALLOW_SIMULATED_SEND || "").toLowerCase() === "true";

let birthdayCache = {
  mtimeMs: 0,
  all: []
};

app.use(express.json());
app.use(
  express.static(__dirname, {
    etag: true,
    lastModified: true,
    maxAge: "7d",
    setHeaders: (res, filePath) => {
      const base = path.basename(filePath).toLowerCase();
      if (base === "index.html") {
        res.setHeader("Cache-Control", "no-cache");
      }
      if (base === "team info.xlsx") {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  })
);

function formatDateTime(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function normalizeHeaderCell(value) {
  return String(value ?? "")
    .replace(/['"“”‘’]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function cleanCellText(value) {
  return String(value ?? "")
    .trim()
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, "")
    .trim();
}

function parseBirthday(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsedDate = XLSX.SSF.parse_date_code(value);
    const month = Number(parsedDate?.m);
    const day = Number(parsedDate?.d);
    if (Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day, label: `${month}월 ${day}일` };
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return { month, day, label: `${month}월 ${day}일` };
  }

  const text = cleanCellText(value);
  if (!text) return null;
  const normalized = text.replace(/\s+/g, "");
  const mdOnly = normalized.match(/^(\d{1,2})[./-](\d{1,2})$/);
  const ymd = normalized.match(/^(?:\d{2,4})[./-](\d{1,2})[./-](\d{1,2})$/);
  const kor = normalized.match(/(\d{1,2})\D+(\d{1,2})/);
  const match = mdOnly || ymd || kor;
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day, label: `${month}월 ${day}일` };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDaysFromToday(month, day, baseDate = new Date()) {
  const today = startOfDay(baseDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  const candidates = [
    new Date(today.getFullYear() - 1, month - 1, day),
    new Date(today.getFullYear(), month - 1, day),
    new Date(today.getFullYear() + 1, month - 1, day)
  ];
  return candidates
    .map((candidate) => Math.round((startOfDay(candidate) - today) / msPerDay))
    .sort((a, b) => Math.abs(a) - Math.abs(b))[0];
}

function findBirthdayHeader(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const normalized = row.map((cell) => normalizeHeaderCell(cell));
    const hasName = normalized.includes("이름");
    const hasBirthday = normalized.includes("생일");
    if (!hasName || !hasBirthday) continue;
    return {
      dataStartIndex: i + 1,
      columnMap: {
        name: normalized.indexOf("이름"),
        grade: normalized.indexOf("직급"),
        birthday: normalized.indexOf("생일"),
        employeeId: normalized.indexOf("사번")
      }
    };
  }
  return null;
}

function toBirthdayEntries(rows, columnMap = null) {
  return rows
    .map((row) => {
      const asArray = Array.isArray(row)
        ? row
        : [row["이름"] ?? "", row["직급"] ?? "", row["생일"] ?? "", row["사번"] ?? ""];
      const nameIndex = columnMap && Number.isInteger(columnMap.name) && columnMap.name >= 0 ? columnMap.name : 0;
      const gradeIndex = columnMap && Number.isInteger(columnMap.grade) && columnMap.grade >= 0 ? columnMap.grade : 1;
      const birthdayIndex =
        columnMap && Number.isInteger(columnMap.birthday) && columnMap.birthday >= 0 ? columnMap.birthday : 2;
      const employeeIdIndex =
        columnMap && Number.isInteger(columnMap.employeeId) && columnMap.employeeId >= 0 ? columnMap.employeeId : 3;

      const columnOffset = !asArray[nameIndex] && asArray[nameIndex + 1] ? 1 : 0;
      const name = cleanCellText(asArray[nameIndex + columnOffset]);
      const grade = cleanCellText(asArray[gradeIndex + columnOffset]);
      const birthdayCell = asArray[birthdayIndex + columnOffset];
      const birthdayRaw = typeof birthdayCell === "string" ? cleanCellText(birthdayCell) : birthdayCell;
      const employeeId = cleanCellText(asArray[employeeIdIndex + columnOffset]);
      const parsed = parseBirthday(birthdayRaw);
      if (!name || !employeeId || !parsed) return null;
      return {
        name,
        grade,
        birthday: parsed.label,
        month: parsed.month,
        day: parsed.day,
        profileUrl: `https://ep.lgcns.com/portal/main/listUserMain.do?rightFrameUrl=/support/profile/getProfile.do?targetUserId=${encodeURIComponent(
          employeeId
        )}`
      };
    })
    .filter(Boolean);
}

async function getBirthdaysFromExcel() {
  const stats = await fs.stat(TEAM_INFO_FILE);
  if (birthdayCache.all.length > 0 && birthdayCache.mtimeMs === stats.mtimeMs) {
    return birthdayCache.all;
  }

  const workbook = XLSX.readFile(TEAM_INFO_FILE, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerInfo = findBirthdayHeader(rows);
  const dataRows = headerInfo ? rows.slice(headerInfo.dataStartIndex) : rows.slice(1);
  const entries = toBirthdayEntries(dataRows, headerInfo ? headerInfo.columnMap : null);

  const allSorted = entries.sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    if (a.day !== b.day) return a.day - b.day;
    return a.name.localeCompare(b.name, "ko");
  });

  birthdayCache = {
    mtimeMs: stats.mtimeMs,
    all: allSorted
  };
  return allSorted;
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
    throw new Error(`슬랙 웹훅 전송 실패 (${response.status}): ${body}`);
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

app.get("/api/birthdays", async (req, res) => {
  try {
    const beforeDays = Number.isFinite(Number(req.query.before)) ? Number(req.query.before) : 14;
    const afterDays = Number.isFinite(Number(req.query.after)) ? Number(req.query.after) : 7;
    const maxItems = Number.isFinite(Number(req.query.max)) ? Number(req.query.max) : 4;
    const normalizedBefore = Math.max(0, Math.min(60, Math.floor(beforeDays)));
    const normalizedAfter = Math.max(0, Math.min(60, Math.floor(afterDays)));
    const normalizedMax = Math.max(1, Math.min(20, Math.floor(maxItems)));
    const today = new Date();

    const all = await getBirthdaysFromExcel();
    const scored = all
      .map((item) => ({ ...item, diffDays: diffDaysFromToday(item.month, item.day, today) }))
      .sort((a, b) => {
        if (Math.abs(a.diffDays) !== Math.abs(b.diffDays)) return Math.abs(a.diffDays) - Math.abs(b.diffDays);
        if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
        return a.name.localeCompare(b.name, "ko");
      });

    let recent = scored
      .filter((item) => item.diffDays >= -normalizedBefore && item.diffDays <= normalizedAfter)
      .sort((a, b) => {
        if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
        return a.name.localeCompare(b.name, "ko");
      })
      .slice(0, normalizedMax);

    if (recent.length === 0 && scored.length > 0) {
      recent = [scored[0]];
    }

    res.json({
      ok: true,
      beforeDays: normalizedBefore,
      afterDays: normalizedAfter,
      maxItems: normalizedMax,
      recent,
      all
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message || "birthday read error" });
  }
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
