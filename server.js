const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const SYSTEM_PROMPT = `You are a multi-stage Strategic Opportunity Diagnostic Pipeline combining 7 specialist agents. Run ALL stages in full sequence. Board-ready consulting tone — professional, quantifiable, evidence-based. Label unconfirmed data as "estimated" or "based on industry patterns". Never fabricate specific numbers. Use ONLY the stage names below in output.

STAGE 01 — MARKET INTELLIGENCE: Trend Overview (STRONG/MOD-HIGH/MODERATE/EMERGING), Competitive Landscape (HIGH/MODERATE/MOD-LOW), TAM/SAM/SOM ±20%, Consumer Behavior with citations.
STAGE 02 — UX & BEHAVIORAL RESEARCH: Primary & Secondary Personas, Top 5 User Friction Points (High/Medium/Low), User Journey Map, Unmet Needs.
STAGE 03 — VOICE-OF-CUSTOMER: 8 Community Quotes [Source][COMPLAINT/FRICTION SIGNAL/POSITIVE SIGNAL], Sentiment %, Recurring Themes table, Top Communities.
STAGE 04 — STRATEGIC SYNTHESIS: Opportunity List, RICE Matrix (P0/P1/P2), Opportunity Clusters, Quick Wins vs Long-term, 5 Executive Takeaways.
STAGE 05 — GROWTH STRATEGIST: Growth Experiments Table, 3 Acquisition Channels with CAC, Viral Loop, Funnel Fixes, North Star Metric.
STAGE 06 — ANALYTICS & ROI: KPI Dashboard, ROI Estimates Table, Revenue Opportunity (Conservative/Moderate/Optimistic), Risk Factors.
STAGE 07 — EXECUTION ROADMAP: Phase 1 (Days 1-30), Phase 2 (Days 31-60), Phase 3 (Days 61-90) — 5 tasks each with owner/timeline/milestone. Resource Allocation. Risk Register top 3.
EXECUTIVE SUMMARY — 7 strategic bullets.
FORMAT: Use ● bullets. ━━━ dividers between stages. Pipe | tables. Cite sources inline.`;

// ── VERIFY LICENSE ─────────────────────────────────────
app.post('/api/verify', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    if (!licenseKey) return res.status(400).json({ valid: false, error: "License key required" });

    const lsRes = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ license_key: licenseKey }),
    });

    const lsData = await lsRes.json();

    if (!lsData.valid) {
      return res.status(200).json({ valid: false, error: "Invalid or expired license key." });
    }

    const used = lsData.license_key?.activation_usage || 0;
    const limit = lsData.license_key?.activation_limit || 10;

    return res.status(200).json({
      valid: true,
      usage: { used, limit, remaining: Math.max(0, limit - used) }
    });

  } catch (err) {
    console.error("Verify error:", err);
    return res.status(500).json({ valid: false, error: "Server error. Please try again." });
  }
});

// ── GENERATE REPORT ────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { licenseKey, topic, language, format } = req.body;
    if (!licenseKey || !topic) return res.status(400).json({ error: "License key and topic required" });

    // 1. Validate license
    const lsRes = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ license_key: licenseKey }),
    });
    const lsData = await lsRes.json();
    if (!lsData.valid) return res.status(403).json({ error: "Invalid or expired license key." });

    // 2. Check usage
    const used = lsData.license_key?.activation_usage || 0;
    const limit = lsData.license_key?.activation_limit || 10;
    if (used >= limit) return res.status(429).json({ error: `Monthly limit reached (${limit} reports).` });

    // 3. Activate license
    await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: `report_${Date.now()}`,
      }),
    });

    // 4. Build prompt
    const userPrompt = format === "short"
      ? `Research Topic: "${topic}"\nLanguage: ${language || "English"}\nFormat: SHORT BRIEF ONLY — maximum 800 words. Top 3 trends, Top 3 friction points, RICE top 3, Top 3 growth tactics, Revenue estimate, 30/60/90 snapshot 2 tasks each, 5-bullet exec summary.`
      : `Research Topic: "${topic}"\nLanguage: ${language || "English"}\nRun all 7 stages in FULL. Deliver every deliverable. Minimum 15 pages of content.`;

    // 5. Call Claude API (no timeout limit on Railway!)
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);
    const report = claudeData.content?.[0]?.text;
    if (!report) throw new Error("No report generated");

    return res.status(200).json({
      report,
      usage: { used: used + 1, limit, remaining: Math.max(0, limit - used - 1) },
    });

  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`BSF Pipeline server running on port ${PORT}`);
});