import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Railway API running" });
});

// Example pipeline endpoint
app.post("/run", async (req, res) => {
  try {
    const { input } = req.body;

    // Example Claude call (replace with your logic)
    // const result = await axios.post("https://api.anthropic.com/v1/messages", {...})

    res.json({
      success: true,
      input,
      output: "Your pipeline result here"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Railway auto-injects PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
