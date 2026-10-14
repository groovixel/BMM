import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const mountNode = document.getElementById("bdsm-marvel-root") || document.getElementById("root");
const root = ReactDOM.createRoot(mountNode);
async function start() {
  // WordPress injects the current public content into BDS_WORDPRESS during
  // page rendering. Mount immediately instead of waiting for a duplicate API
  // request before showing the homepage.
  const { default: App } = await import('@/App');
  root.render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
}
start();
