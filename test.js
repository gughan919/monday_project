require("dotenv").config();
const axios = require("axios");

// 🔑 Load API Key
const API_KEY = process.env.MONDAY_API_KEY;

// 🔁 Replace with your actual board ID
const BOARD_ID = 5028102536; // <-- CHANGE THIS

// 📡 Fetch board data (UPDATED API)
async function fetchBoard(boardId) {
  const query = `
  {
    boards(ids: ${boardId}) {
      name
      items_page {
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

  try {
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

    // 🔍 Debug full response
    console.log("\n🔍 FULL RESPONSE:\n", JSON.stringify(res.data, null, 2));

    // ❌ Handle API errors
    if (res.data.errors) {
      console.error("\n❌ API ERROR:", res.data.errors);
      throw new Error("Monday API returned errors");
    }

    // ❌ Handle empty data
    if (!res.data.data || !res.data.data.boards.length) {
      throw new Error("No board data found. Check Board ID or permissions.");
    }

    return res.data.data.boards[0].items_page.items;

  } catch (err) {
    console.error("\n❌ FETCH ERROR:", err.message);
    throw err;
  }
}

// 🧹 Convert messy API data → clean format
function formatItem(item) {
  let obj = { name: item.name };

  item.column_values.forEach(col => {
    const key = col.column.title;
    let value = col.text;

    if (!value || value === "") value = "Unknown";

    obj[key] = value;
  });

  return obj;
}

// 🚀 MAIN EXECUTION
(async () => {
  try {
    const rawItems = await fetchBoard(BOARD_ID);

    console.log("\n✅ TOTAL ITEMS:", rawItems.length);

    const cleanItems = rawItems.map(formatItem);

    console.log("\n✨ CLEAN DATA SAMPLE:\n");
    console.log(JSON.stringify(cleanItems.slice(0, 3), null, 2));

  } catch (err) {
    console.error("\n🔥 FINAL ERROR:", err.message);
  }
})();