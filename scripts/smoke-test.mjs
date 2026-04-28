const baseUrl = process.env.API_BASE_URL || "http://localhost:8787";

const checks = [
  ["GET", "/api/health"],
  ["GET", "/api/topics"],
  ["GET", "/api/radar"],
  ["GET", "/api/analytics"],
  ["GET", "/api/jobs"],
  ["GET", "/api/settings"],
  ["GET", "/api/assets"],
  ["GET", "/api/push/log"],
];

for (const [method, path] of checks) {
  const response = await fetch(`${baseUrl}${path}`, { method });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new Error(`${method} ${path} did not return a JSON object`);
  }
  console.log(`ok ${method} ${path}`);
}

const contentResponse = await fetch(`${baseUrl}/api/content/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mode: "快讯版" }),
});

if (contentResponse.status !== 200 && contentResponse.status !== 400) {
  throw new Error(`POST /api/content/generate unexpected status: ${contentResponse.status}`);
}

console.log("smoke test passed");
