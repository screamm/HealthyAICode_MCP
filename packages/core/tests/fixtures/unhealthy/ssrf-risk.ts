// Unhealthy fixture: SSRF risk patterns
// Sprint 58 — detectSecuritySinks fixture
import express from 'express';
import axios from 'axios';

const app = express();

// SsrfRisk: fetch with URL from request query parameter
app.get('/proxy', async (req, res) => {
  const url = req.query.url as string;
  const response = await fetch(url);
  const data = await response.text();
  res.send(data);
});

// SsrfRisk: axios.get with URL from request params
app.get('/fetch/:target', async (req, res) => {
  const result = await axios.get(req.params.target);
  res.json(result.data);
});

// Safe: fetch with a hard-coded literal URL — should NOT trigger
app.get('/safe', async (_req, res) => {
  const response = await fetch('https://api.example.com/data');
  const data = await response.json();
  res.json(data);
});
