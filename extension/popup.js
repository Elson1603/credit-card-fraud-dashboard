const API_BASE_URL = "http://127.0.0.1:8000";

const transactionIdEl = document.getElementById("transactionId");
const amountEl = document.getElementById("amount");
const timeEl = document.getElementById("time");
const locationEl = document.getElementById("location");
const merchantEl = document.getElementById("merchant");
const deviceEl = document.getElementById("device");
const internationalEl = document.getElementById("international");
const predictButton = document.getElementById("predict");
const resultEl = document.getElementById("result");
const reasonsEl = document.getElementById("reasons");

predictButton?.addEventListener("click", async () => {
  const transactionId = transactionIdEl?.value?.trim() || "";
  const amount = Number(amountEl?.value || 0);
  const time = Number(timeEl?.value || 0);
  const location = locationEl?.value?.trim() || "Unknown";
  const merchant = merchantEl?.value?.trim() || "Unknown";
  const device = deviceEl?.value?.trim() || "Unknown";
  const international = Boolean(internationalEl?.checked);

  resultEl.textContent = "Running fraud check...";
  resultEl.className = "result";
  reasonsEl.textContent = "";

  try {
    const response = await fetch(`${API_BASE_URL}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_id: transactionId,
        receiver: transactionId,
        amount,
        time,
        location,
        device,
        merchant,
        international,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.label === "Fraud") {
      resultEl.textContent = `Fraud Detected (${(data.probability * 100).toFixed(1)}% risk)`;
      resultEl.className = "result fraud";
    } else {
      resultEl.textContent = `Transaction Safe (${(data.probability * 100).toFixed(1)}% risk)`;
      resultEl.className = "result safe";
    }

    if (Array.isArray(data.risk_reasons) && data.risk_reasons.length) {
      reasonsEl.textContent = `Checks: ${data.risk_reasons.join(", ")}`;
    }
  } catch (error) {
    resultEl.textContent = `Backend unavailable: ${error}`;
    resultEl.className = "result fraud";
  }
});
