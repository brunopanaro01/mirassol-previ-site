import { startCms } from "./core/app.js";

startCms().catch((error) => {
  console.error("Falha ao iniciar o CMS:", error);
  const status = document.getElementById("status");
  status.textContent = `Não foi possível iniciar o painel: ${error.message}`;
  status.classList.add("error");
});
