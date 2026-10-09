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
  if (window.BDS_WORDPRESS?.native) {
    try {
      const url = window.BDS_WORDPRESS.apiUrl + '/content' + (window.BDS_WORDPRESS.apiUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Content unavailable');
      window.BDS_WORDPRESS.content = await response.json();
    } catch (error) {
      if (!window.BDS_WORDPRESS.content) { mountNode.textContent = 'Unable to load the website. Please refresh to try again.'; return; }
    }
  }
  const { default: App } = await import('@/App');
  root.render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
}
start();
