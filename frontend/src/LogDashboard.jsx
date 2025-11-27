import React, { useState } from "react";
import axios from "axios";

function LogDashboard() {
  const [logs, setLogs] = useState([]);

  const API_BASE = "http://127.0.0.1:8000";

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Step 1: Upload file
      await axios.post(`${API_BASE}/read-log/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Step 2: Fetch all logs
      fetchLogs();
    } catch (err) {
      console.error("Error reading log:", err);
    }
  };

  const fetchLogs = async (deviceId = null) => {
    try {
      const res = await axios.get(`${API_BASE}/logs`, {
        params: deviceId ? { device_id: deviceId } : {},
      });
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Application Logs</h1>
      <input type="file" onChange={handleFileUpload} />

      <div className="mt-4">
        {logs.length > 0 ? (
          <pre className="bg-gray-900 text-green-400 p-3 rounded overflow-auto max-h-96 whitespace-pre-wrap">
            {logs
              .map(
                (log) =>
                  // `[${log.device_id}] #${log.device_log_id}: ${log.message}`
                  `${log.message}`
              )
              .join("\n")}
          </pre>
        ) : (
          <p>No logs available</p>
        )}
      </div>
    </div>
  );
}

export default LogDashboard;
