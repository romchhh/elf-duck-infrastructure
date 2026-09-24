import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { UserProvider } from "./UserContext.jsx";

console.log("🚀 React загружается...");

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("❌ Ошибка: `#root` не найден в `index.html`!");
} else {
  console.log("✅ Найден `#root` в `index.html`");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <UserProvider> 
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </UserProvider>
  </React.StrictMode>
);

console.log("✅ React успешно отрендерился!");


