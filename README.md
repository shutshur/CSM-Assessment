# CSM Risk Engine

A lightweight dashboard for Customer Success Managers to ingest customer data matrices, evaluate real-time account risk, and generate tactical action plans using LLM integration.

---

## Features

* **API Loader:** Connect your API key with the platform.
* **CSV Ingestion:** Upload your `"csmbook" .csv` file easily.
* **Operational Filters:** Filter your data using three distinct views:
  * `Full portfolio`
  * `Critical Risk`
  * `Warning Buffer`
* **Column Sorting:** Sort your data dynamically by columns (ascending/descending).
* **AI Action Plans:** Generate tactical action items using either live AI integration or the fallback Local Response system.

---

## How to Run the Tool

1. **Download files:** Save `index.html` and `app.js` into the exact same folder.
2. **Launch:** Double-click `index.html` to open it directly in any modern web browser (*no local server or installations required*).
3. **Authenticate:** Paste your AI system token in the sidebar gateway to unlock live cloud responses (work in progress, Gemini API currently the most stable).
4. **Upload Data:** Ingest your customer evaluation CSV file through the **"Data Ingestion"** box.

---

## Architectural Decision

> **Decision:** Implementing the `PapaParse` Library for CSV Processing (instead of writing custom string-splitting code).

### Why?
Instead of building custom text-parsing logic from scratch (like using `.split(',')`), I chose to implement the **PapaParse** client-side library. 

Real-world CSV files frequently contain commas and quotation marks within the actual data fields—especially in descriptive sections like notes or insights—which easily breaks standard string splitters. PapaParse handles all of these complex edge cases safely directly inside the browser, efficiently and with **zero backend code required**.

---

## Future Improvements (With More Time)

If given more development runway, I would focus on expanding **AI capabilities** & **Advanced Filtering**:
* **Broader LLM Support:** Enhance the built-in AI features to natively support a wider selection of LLM models and fine-tuned system prompts.
* **Granular Filtering:** Introduce deeper data filters, providing managers with significantly better insights into account trends and allowing them to slice and dice the portfolio with even greater precision.

---

## Special Mention

* **API Constraints:** Proper API implementation and functionality development was limited due to the usage of a free Gemini API key, which enforces a daily usage quota. 
* **Timeline:** The current state of AI enhancement took **~1h** to fully implement. The overall assignment was completed successfully within the given timeframe (+- 30 mins).
