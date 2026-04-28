require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const API_KEY = process.env.MONDAY_API_KEY;
const WORK_BOARD = process.env.WORK_BOARD_ID;
const DEALS_BOARD = process.env.DEALS_BOARD_ID;

// 📡 Fetch data from monday
async function fetchBoard(boardId) {
  const query = `
  {
    boards(ids: ${boardId}) {
      items_page(limit: 100) {
        items {
          name
          column_values {
            text
            column { title }
          }
        }
      }
    }
  }`;

  const res = await axios.post(
    "https://api.monday.com/v2",
    { query },
    {
      headers: {
        Authorization: API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  if (res.data.errors) {
    throw new Error(JSON.stringify(res.data.errors));
  }

  return res.data.data.boards[0].items_page.items;
}

// 🧹 Clean data
function clean(items) {
  return items.map(item => {
    let obj = { name: item.name };

    item.column_values.forEach(col => {
      obj[col.column.title] = col.text || "Unknown";
    });

    return obj;
  });
}

// 📊 Status breakdown
function getStatusCounts(work) {
  let counts = {};
  work.forEach(w => {
    let s = w.Status || "Unknown";
    counts[s] = (counts[s] || 0) + 1;
  });
  return counts;
}

// 💰 Pipeline calc
function getPipeline(deals) {
  let total = 0;
  let missing = 0;

  deals.forEach(d => {
    let val = Number(
      (d["Deal Value"] || "").replace(/[^0-9.-]+/g, "")
    );

    if (!val) {
      missing++;
    } else {
      total += val;
    }
  });

  return { total, missing };
}

// 🧠 MAIN AGENT
app.post("/ask", async (req, res) => {
  const question = (req.body.question || "").toLowerCase();

  try {
    const workRaw = await fetchBoard(WORK_BOARD);
    const dealsRaw = await fetchBoard(DEALS_BOARD);

    const work = clean(workRaw);
    const deals = clean(dealsRaw);

    let answer = "";

    // 🔥 1. LEADERSHIP UPDATE
    if (
      question.includes("leadership") ||
      question.includes("update") ||
      question.includes("summary")
    ) {
      const status = getStatusCounts(work);

      answer = `Leadership Update:

Work Orders:
- Total: ${work.length}
- Not Started: ${status["Not Started"] || 0}

Deals:
- Total Deals: ${deals.length}

Key Insight:
A large portion of work orders are not started, indicating backlog.

Risk:
Data quality is poor — cost estimates, ownership, and deal values are missing.

Recommendation:
Improve data completeness before making strategic decisions.`;
    }

    // 🔥 2. STATUS
    else if (question.includes("status")) {
      const counts = getStatusCounts(work);

      answer = `Work Order Status Breakdown:\n`;

      for (let key in counts) {
        answer += `- ${key}: ${counts[key]}\n`;
      }

      answer += `\nInsight:
This helps identify execution bottlenecks.`;
    }

    // 🔥 3. PIPELINE
    else if (
      question.includes("pipeline") ||
      question.includes("deal") ||
      question.includes("revenue")
    ) {
      const result = getPipeline(deals);

      answer = `Pipeline Overview:

- Total Deals: ${deals.length}
- Pipeline Value: ₹${result.total}

⚠️ ${result.missing} deals have missing values.

Insight:
Financial visibility is limited due to incomplete data.`;
    }

    // 🔥 4. RISKS
    else if (
      question.includes("risk") ||
      question.includes("issue")
    ) {
      answer = `Key Business Risks:

1. Many work orders not started → execution delay
2. Missing cost data → financial visibility risk
3. Missing ownership → accountability risk

Recommendation:
Improve data completeness and prioritize pending work.`;
    }

    // 🔥 5. WORK ORDERS (kept LAST)
    else if (
      question.includes("work") ||
      question.includes("order")
    ) {
      const total = work.length;
      const notStarted = work.filter(
        w => w.Status === "Not Started"
      ).length;

      const percent =
        total > 0 ? Math.round((notStarted / total) * 100) : 0;

      answer = `Work Orders Overview:

- Total: ${total}
- Not Started: ${notStarted} (${percent}%)

Insight:
This suggests a backlog in execution.

⚠️ Most cost fields are missing, limiting financial analysis.`;
    }

    // 🔥 DEFAULT
    else {
      answer = `I can answer:

- Leadership update
- Work order status
- Pipeline / deals
- Business risks
- Data quality

Try:
"give me leadership update"
"show work order status"
"what is total pipeline"
"what are the risks"`;
    }

    res.json({ answer });

  } catch (err) {
    res.status(500).json({
      error: "Something went wrong",
      details: err.message
    });
  }
});

// 🟢 Health check
app.get("/", (req, res) => {
  res.send("Monday BI Agent is running 🚀");
});

// 🚀 Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});