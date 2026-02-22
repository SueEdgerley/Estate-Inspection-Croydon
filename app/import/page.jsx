'use client'

import { useState } from 'react'

export default function ImportPhotobookPage() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('completed')
  const [result, setResult] = useState('')

  async function upload() {
    if (!file) return
    setResult('Uploading...')

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`/api/import/photobook?status=${status}`, {
        method: "POST",
        body: fd,
      });

      const data = await res.text();
      setResult(data);
    } catch (err) {
      setResult(`Error: ${err?.message ?? String(err)}`);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>Import Photobook CSV</h1>

      <div style={{ marginTop: 12 }}>
        <label>
          Type:&nbsp;
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="completed">Completed</option>
            <option value="missed">Missed</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={upload} disabled={!file}>
          Upload CSV
        </button>
      </div>

      <pre style={{ marginTop: 12, background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
        {result}
      </pre>
    </div>
  )
}
