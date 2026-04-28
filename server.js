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

if (!API_KEY || !WORK_BOARD || !DEALS_BOARD) {
  console.warn("⚠️ Missing environment variables. Check .env file.");
}

async function fetchBoard(boardId) {
  const query = `
  {
    boards(ids: ${boardId}) {
      name
      items_page(limit: 100) {
        items {
          name
          column_values {
            text
            column {
              title
            }
          }
        }
      }
    }
  }`;

  const response = await axios.post(
    "https://api.monday.com/v2",
    { query },
    {
      headers: {
        Authorization: API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  if (response.data.errors) {
    throw new Error(JSON.stringify(response.data.errors));
  }

  if (
    !response.data.data ||
    !response.data.data.boards ||
    response.data.data.boards.length === 0
  ) {
    throw new Error("No board data found. Check board ID or permissions.");
  }

  return response.data.data.boards[0].items_page.items;
}

function cleanData(items) {
  return items.map(item => {
    const row = {
      name: item.name
    };

    item.column_values.forEach(col => {
      const key = col.column.title;
      const value = col.text;

      row[key] = value && value.trim() !== "" ? value : "Unknown";
    });

    return row;
  });
}

function countMissing(records) {
  let missing = 0;
  let total = 0;

  records.forEach(record => {
    Object.values(record).forEach(value => {
      total++;

      if (!value || value === "Unknown") {
        missing++;
      }
    });
  });

  return {
    missing,
    total
  };
}

function getStatusBreakdown(workOrders) {
  const counts = {};

  workOrders.forEach(order => {
    const status = order.Status || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
  });

  return counts;
}

function formatStatusBreakdown(counts) {
  let output = "";

  Object.keys(counts).forEach(status => {
    output += `- ${status}: ${counts[status]}\n`;
  });

  return output || "- No status data available\n";
}

function parseMoney(value) {
  if (!value || value === "Unknown") return null;

  const number = Number(String(value).replace(/[^0-9.-]+/g, ""));

  if (Number.isNaN(number)) return null;

  return number;
}

function getPipelineSummary(deals) {
  let totalValue = 0;
  let validValues = 0;
  let missingValues = 0;

  deals.forEach(deal => {
    const possibleValue =
      deal["Deal Value"] ||
      deal["Value"] ||
      deal["Amount"] ||
      deal["Revenue"] ||
      deal["Expected Revenue"] ||
      "Unknown";

    const parsed = parseMoney(possibleValue);

    if (parsed === null) {
      missingValues++;
    } else {
      totalValue += parsed;
      validValues++;
    }
  });

  return {
    totalValue,
    validValues,
    missingValues
  };
}

function sectorFilter(records, question) {
  const sectors = [
    "energy",
    "healthcare",
    "finance",
    "retail",
    "manufacturing",
    "technology",
    "education",
    "construction",
    "real estate",
    "automotive"
  ];

  const matchedSector = sectors.find(sector => question.includes(sector));

  if (!matchedSector) {
    return {
      sector: null,
      records
    };
  }

  const filtered = records.filter(record => {
    const text = JSON.stringify(record).toLowerCase();
    return text.includes(matchedSector);
  });

  return {
    sector: matchedSector,
    records: filtered
  };
}

app.get("/", (req, res) => {
  res.send("Monday BI Agent backend is running");
});

app.post("/ask", async (req, res) => {
  const question = (req.body.question || "").toLowerCase();

  try {
    const workRaw = await fetchBoard(WORK_BOARD);
    const dealsRaw = await fetchBoard(DEALS_BOARD);

    const workOrders = cleanData(workRaw);
    const deals = cleanData(dealsRaw);

    const workMissing = countMissing(workOrders);
    const dealsMissing = countMissing(deals);
    const statusCounts = getStatusBreakdown(workOrders);
    const pipeline = getPipelineSummary(deals);

    let answer = "";

    if (
      question.includes("leadership") ||
      question.includes("update") ||
      question.includes("summary")
    ) {
      answer = `Leadership Update:

Work Orders:
- Total work orders: ${workOrders.length}
${formatStatusBreakdown(statusCounts)}

Deals:
- Total deals: ${deals.length}
- Estimated pipeline value: ₹${pipeline.totalValue}
- Deals with missing or invalid value: ${pipeline.missingValues}

Key Insight:
The system can provide operational visibility, especially around work-order status and deal count.

Risk:
Many records have missing fields such as cost estimates, owners, priority, and deal values. This limits financial accuracy and accountability tracking.

Recommendation:
Before using this data for executive financial decisions, improve data completeness for cost, owner, priority, sector, and deal value fields.`;
    }

    else if (question.includes("status")) {
      answer = `Work Order Status Breakdown:

${formatStatusBreakdown(statusCounts)}

Insight:
This helps identify execution bottlenecks and pending operational work.`;
    }

    else if (
      question.includes("pipeline") ||
      question.includes("deal") ||
      question.includes("revenue")
    ) {
      const sectorResult = sectorFilter(deals, question);
      const selectedDeals = sectorResult.records;
      const selectedPipeline = getPipelineSummary(selectedDeals);

      answer = `Pipeline Overview${sectorResult.sector ? ` for ${sectorResult.sector}` : ""}:

- Deals analyzed: ${selectedDeals.length}
- Estimated pipeline value: ₹${selectedPipeline.totalValue}
- Deals with missing or invalid value: ${selectedPipeline.missingValues}

Insight:
Pipeline visibility is available, but confidence depends on deal-value completeness.

Data Quality Caveat:
${dealsMissing.missing} out of ${dealsMissing.total} deal fields are missing or unknown.`;
    }

    else if (
      question.includes("work") ||
      question.includes("order") ||
      question.includes("orders")
    ) {
      const total = workOrders.length;
      const notStarted = workOrders.filter(
        order => order.Status === "Not Started"
      ).length;

      const percentNotStarted =
        total > 0 ? Math.round((notStarted / total) * 100) : 0;

      answer = `Work Orders Overview:

- Total work orders: ${total}
- Not Started: ${notStarted}
- Not Started Percentage: ${percentNotStarted}%

Insight:
A high Not Started percentage may indicate an execution backlog.

Data Quality Caveat:
${workMissing.missing} out of ${workMissing.total} work-order fields are missing or unknown, so cost and ownership analysis may be limited.`;
    }

    else if (
      question.includes("risk") ||
      question.includes("issue") ||
      question.includes("problem")
    ) {
      answer = `Key Business Risks:

1. Execution Risk:
Some work orders may not have progressed, which can indicate operational backlog.

2. Financial Visibility Risk:
Missing cost estimates and deal values reduce confidence in revenue and margin reporting.

3. Ownership Risk:
Missing assigned owners make accountability harder to track.

Recommendation:
Prioritize cleaning ownership, priority, cost estimate, deal value, and sector fields.`;
    }

    else if (
      question.includes("missing") ||
      question.includes("quality") ||
      question.includes("data")
    ) {
      answer = `Data Quality Report:

Work Orders:
- Total records: ${workOrders.length}
- Missing or unknown fields: ${workMissing.missing} out of ${workMissing.total}

Deals:
- Total records: ${deals.length}
- Missing or unknown fields: ${dealsMissing.missing} out of ${dealsMissing.total}

Interpretation:
The agent can answer basic business questions, but financial and ownership insights are limited by incomplete data.`;
    }

    else {
      answer = `I can answer founder-level business questions about:

- Work orders
- Deal pipeline
- Revenue visibility
- Status breakdown
- Business risks
- Data quality
- Leadership updates

Try asking:
"give me leadership update"
"show work order status"
"what is total pipeline?"
"how many work orders?"
"show data quality"
"what are the risks?"`;
    }

    res.json({ answer });

  } catch (error) {
    res.status(500).json({
      error: "Something went wrong",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});