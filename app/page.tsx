"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminPanel from "@/components/admin-panel";

const initialLinks = {
  partner: "https://404team.space/?ref=4qmUp5GA",
  chat: "https://t.me/+rwtcQpWbn8NiZjhi",
  channel: "",
};

function sendEvent(type: "page_view" | "click", action = "") {
  const params = new URLSearchParams(window.location.search);
  const body = JSON.stringify({
    type,
    action,
    ref: params.get("ref") || "",
    page: window.location.pathname,
    referrer: document.referrer,
  });
  if (type === "click" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
  } else {
    void fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true,
    });
  }
}

export default function Home() {
  const [links, setLinks] = useState(initialLinks);
  const [adminOpen, setAdminOpen] = useState(false);
  const logoClicks = useRef<number[]>([]);

  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" })
      .then(async (response) => (response.ok ? (await response.json()) as { links?: typeof initialLinks } : null))
      .then((data) => data?.links && setLinks(data.links))
      .catch(() => undefined);
    sendEvent("page_view");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.altKey) && event.shiftKey && event.code === "KeyH") {
        event.preventDefault();
        setAdminOpen(true);
      }
    };
    const openFromAddress = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("admin") === "1" || window.location.hash === "#admin") setAdminOpen(true);
    };
    openFromAddress();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("hashchange", openFromAddress);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("hashchange", openFromAddress);
    };
  }, []);

  function handleLogoClick() {
    const now = Date.now();
    logoClicks.current = [...logoClicks.current.filter((time) => now - time < 3000), now];
    if (logoClicks.current.length >= 5) {
      logoClicks.current = [];
      setAdminOpen(true);
    }
  }

  const actions = useMemo(
    () => [
      { key: "partner", href: links.partner, className: "btn btn-main", label: "Стать партнёром" },
      { key: "chat", href: links.chat, className: "btn btn-alt", label: "Войти в чат веб-мастеров" },
      { key: "channel", href: links.channel, className: "chan", label: "Telegram-канал" },
    ],
    [links],
  );

  return (
    <>
      <main className="landing-shell">
        <div className="wrap">
          <header className="site-header">
            <button className="logo-trigger" type="button" onClick={handleLogoClick} aria-label="404 Team">
              <img className="logo" src="/logo.png" alt="" />
            </button>
            <span className="brand">404 Team</span>
          </header>
          <section className="hero">
            <img src="/hero.jpg" alt="Маскот 404 Team" />
            <div className="hero-text">
              <h1>Монетизируем<br /><span>твой трафик</span></h1>
              <p>Холдинг по офферам и трафику: свои офферы и трафик для рекламодателей.</p>
            </div>
          </section>
          <ul className="facts">
            <li><b>15+</b><span>офферов</span></li>
            <li><b>до $150</b><span>ставка CPA</span></li>
            <li><b>от 15 FTD</b><span>гибкие выплаты</span></li>
          </ul>
          <section className="edge">
            <h2>Очень высокий ретеншн</h2>
            <p>Наши сервисы и обработка удерживают трафик, поэтому капу пройти легче, чем у прямых рекламодателей.</p>
          </section>
          <div className="actions">
            <p className="note">Работаем с теми, у кого уже есть трафик.</p>
            {actions.map((action) => action.href ? (
              <a key={action.key} className={action.className} href={action.href} onClick={() => sendEvent("click", action.key)}>
                {action.label}
              </a>
            ) : null)}
          </div>
        </div>
      </main>
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </>
  );
}
