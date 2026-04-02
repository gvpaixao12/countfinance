import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import routes from "./api/routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", routes);

// Em producao, serve o frontend buildado
const frontendPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`fintrack rodando em http://localhost:${PORT}`);
});
