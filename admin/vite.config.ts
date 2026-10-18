import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [react()],
    server: {
      host: env.VITE_HOST || "127.0.0.1",
      port: 5174,
      // 只允许项目的 OrbStack 域名，避免开放 Vite 的任意 Host 请求。
      allowedHosts: ["admin.zhushou.orb.local"],
      proxy: {
        "/api": "http://localhost:3000",
      },
    },
  };
});
