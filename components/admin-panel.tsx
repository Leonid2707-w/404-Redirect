"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Props = { open: boolean; onClose: () => void };
type LinkItem = { id: number; slug: string; label: string; source: string; account: string; campaign: string; active: number; created_at: string };
type StatLink = LinkItem & { views: number; visitors: number; clicks: number; unique_clicks: number; partner_clicks: number; chat_clicks: number; channel_clicks: number };
type Stats = { totals: Record<string, number>; links: StatLink[]; timeline: Array<{ day: string; views: number; clicks: number }>; recent: Array<Record<string, string | number | null>> };
type Settings = { partner_url: string; chat_url: string; channel_url: string; telegram_enabled: string };
type TelegramState = { tokenConfigured: boolean; chatConfigured: boolean };

const emptyStats: Stats = { totals: {}, links: [], timeline: [], recent: [] };
const emptySettings: Settings = { partner_url: "", chat_url: "", channel_url: "", telegram_enabled: "true" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data as T;
}

function n(value: unknown) {
  return Number(value || 0).toLocaleString("ru-RU");
}

export default function AdminPanel({ open, onClose }: Props) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [telegram, setTelegram] = useState({ tokenConfigured: false, chatConfigured: false });
  const [period, setPeriod] = useState("30");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadAll = useCallback(async (days = period) => {
    const [linksData, statsData, settingsData] = await Promise.all([
      requestJson<{ links: LinkItem[] }>("/api/admin/links"),
      requestJson<Stats>(`/api/admin/stats?days=${days}`),
      requestJson<{ settings: Settings; telegram: TelegramState }>("/api/admin/settings"),
    ]);
    setLinks(linksData.links || []);
    setStats(statsData);
    setSettings(settingsData.settings);
    setTelegram(settingsData.telegram);
  }, [period]);

  useEffect(() => {
    if (!open) return;
    setChecking(true);
    setError("");
    void requestJson<{ authenticated: boolean }>("/api/admin/session")
      .then(async (data) => {
        setAuthenticated(Boolean(data.authenticated));
        if (data.authenticated) await loadAll();
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, [open, loadAll]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      await requestJson("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: values.get("login"), password: values.get("password") }),
      });
      setAuthenticated(true);
      await loadAll();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await requestJson("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
  }

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const result = await requestJson<{ ok: boolean; slug: string }>("/api/admin/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      form.reset();
      setNotice(`Ссылка ${result.slug} создана`);
      await loadAll();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать ссылку");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLink(link: LinkItem) {
    setBusy(true);
    try {
      await requestJson("/api/admin/links", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...link, active: !Boolean(link.active) }),
      });
      await loadAll();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Не удалось обновить ссылку");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...settings, telegram_enabled: settings.telegram_enabled !== "false" }),
      });
      setNotice("Настройки сохранены");
      await loadAll();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Не удалось сохранить настройки");
    } finally {
      setBusy(false);
    }
  }

  async function testTelegram() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestJson<{ ok: boolean }>("/api/admin/telegram-test", { method: "POST" });
      setNotice("Тестовое сообщение отправлено в Telegram");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Не удалось проверить Telegram");
    } finally {
      setBusy(false);
    }
  }

  async function changePeriod(value: string) {
    setPeriod(value);
    setBusy(true);
    try {
      setStats(await requestJson<Stats>(`/api/admin/stats?days=${value}`));
    } finally {
      setBusy(false);
    }
  }

  function trackingUrl(slug: string) {
    return `${window.location.origin}/?ref=${encodeURIComponent(slug)}`;
  }

  async function copyLink(slug: string) {
    await navigator.clipboard.writeText(trackingUrl(slug));
    setNotice("Ссылка скопирована");
  }

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Админ-панель">
      <div className="admin-window">
        <div className="admin-topbar">
          <div><span className="admin-eyebrow">404 Team</span><h2>Управление трафиком</h2></div>
          <div className="admin-top-actions">
            {authenticated && <button onClick={logout}>Выйти</button>}
            <button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button>
          </div>
        </div>

        {checking ? <div className="admin-loading">Проверяем доступ…</div> : !authenticated ? (
          <form className="login-card" onSubmit={login}>
            <h3>Вход в админ-панель</h3>
            <p>Панель открывается сочетанием Ctrl + Shift + H.</p>
            <label>Логин<input name="login" autoComplete="username" required autoFocus /></label>
            <label>Пароль<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="admin-primary" disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
          </form>
        ) : (
          <div className="admin-content">
            <div className="admin-status-row">
              <div>{notice && <span className="form-success">{notice}</span>}{error && <span className="form-error">{error}</span>}</div>
              <label className="period-select">Период<select value={period} onChange={(event) => changePeriod(event.target.value)}><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="all">Всё время</option></select></label>
            </div>

            <section className="metric-grid" aria-label="Сводка">
              <article><span>Просмотры</span><strong>{n(stats.totals.views)}</strong></article>
              <article><span>Уникальные</span><strong>{n(stats.totals.visitors)}</strong></article>
              <article><span>Все клики</span><strong>{n(stats.totals.clicks)}</strong></article>
              <article><span>Уникальные клики</span><strong>{n(stats.totals.unique_clicks)}</strong></article>
              <article><span>Стать партнёром</span><strong>{n(stats.totals.partner_clicks)}</strong></article>
              <article><span>Чат</span><strong>{n(stats.totals.chat_clicks)}</strong></article>
              <article><span>Канал</span><strong>{n(stats.totals.channel_clicks)}</strong></article>
            </section>

            <div className="admin-columns">
              <section className="admin-card">
                <div className="card-heading"><div><span className="admin-eyebrow">Создание</span><h3>Новая уникальная ссылка</h3></div></div>
                <form className="link-form" onSubmit={createLink}>
                  <label className="full">Подпись<input name="label" placeholder="TikTok — аккаунт 2" required /></label>
                  <label>Источник<input name="source" placeholder="TikTok" /></label>
                  <label>Аккаунт<input name="account" placeholder="Аккаунт 2" /></label>
                  <label>Кампания<input name="campaign" placeholder="Октябрь / RU" /></label>
                  <label>Короткий код<input name="slug" placeholder="tiktok-2 (необязательно)" pattern="[a-z0-9_-]{2,64}" /></label>
                  <button className="admin-primary full" disabled={busy}>Создать ссылку</button>
                </form>
              </section>

              <section className="admin-card">
                <div className="card-heading"><div><span className="admin-eyebrow">Интеграции</span><h3>Кнопки и Telegram</h3></div></div>
                <form className="settings-form" onSubmit={saveSettings}>
                  <label>«Стать партнёром»<input type="url" value={settings.partner_url} onChange={(e) => setSettings({ ...settings, partner_url: e.target.value })} required /></label>
                  <label>«Войти в чат»<input type="url" value={settings.chat_url} onChange={(e) => setSettings({ ...settings, chat_url: e.target.value })} required /></label>
                  <label>Telegram-канал<input type="url" value={settings.channel_url} onChange={(e) => setSettings({ ...settings, channel_url: e.target.value })} placeholder="Пусто — скрыть ссылку" /></label>
                  <label className="switch-row"><input type="checkbox" checked={settings.telegram_enabled !== "false"} onChange={(e) => setSettings({ ...settings, telegram_enabled: e.target.checked ? "true" : "false" })} /><span>Отправлять клики в Telegram</span></label>
                  <p className={`integration-state ${telegram.tokenConfigured && telegram.chatConfigured ? "ready" : ""}`}>{telegram.tokenConfigured && telegram.chatConfigured ? "Бот и канал настроены на сервере" : "Нужно добавить токен бота и ID канала в защищённые переменные сервера"}</p>
                  <div className="settings-actions">
                    <button className="admin-primary" disabled={busy}>Сохранить</button>
                    <button className="admin-secondary" type="button" disabled={busy} onClick={testTelegram}>Проверить Telegram</button>
                  </div>
                </form>
              </section>
            </div>

            <section className="admin-card wide-card">
              <div className="card-heading"><div><span className="admin-eyebrow">Атрибуция</span><h3>Ссылки и результаты</h3></div><span>{links.length} шт.</span></div>
              <div className="table-scroll"><table><thead><tr><th>Подпись</th><th>Источник / аккаунт</th><th>URL</th><th>Просмотры</th><th>Уникальные просмотры</th><th>Клики</th><th>Уникальные клики</th><th>Действия</th></tr></thead><tbody>
                {stats.links.map((link) => <tr key={link.id} className={!link.active ? "row-disabled" : ""}>
                  <td><strong>{link.label}</strong>{link.campaign && <small>{link.campaign}</small>}</td>
                  <td>{link.source || "—"}<small>{link.account || ""}</small></td><td><code>?ref={link.slug}</code></td>
                  <td>{n(link.views)}</td><td>{n(link.visitors)}</td><td>{n(link.clicks)}</td><td>{n(link.unique_clicks)}</td>
                  <td><div className="row-actions"><button onClick={() => copyLink(link.slug)}>Копировать</button><button onClick={() => toggleLink(link)}>{link.active ? "Отключить" : "Включить"}</button></div></td>
                </tr>)}
                {!stats.links.length && <tr><td colSpan={8} className="empty-cell">Пока нет ссылок. Создайте первую выше.</td></tr>}
              </tbody></table></div>
            </section>

            <section className="admin-card wide-card">
              <div className="card-heading"><div><span className="admin-eyebrow">Журнал</span><h3>Последние события</h3></div></div>
              <div className="event-list">
                {stats.recent.map((event) => <div className="event-row" key={String(event.id)}><span className={`event-dot ${event.event_type === "click" ? "click" : ""}`} /><div><strong>{event.event_type === "click" ? `Клик: ${event.action}` : "Просмотр страницы"}</strong><small>{event.label || "Без метки"} · {event.source || "direct"} · {event.country || "—"}</small></div><time>{new Date(String(event.created_at)).toLocaleString("ru-RU")}</time></div>)}
                {!stats.recent.length && <p className="empty-cell">Событий пока нет.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
