"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import Button from "@/components/common/Button";
import Card from "@/components/common/Card";
import Loading from "@/components/common/Loading";
import StatusStack from "@/components/common/StatusStack";
import { providerSettings, updateProviderSettings } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { openDataDir, openLogsDir, restartBackend, useRuntimeConfig } from "@/lib/runtime";
import type { ProviderSettingsUpdate } from "@/lib/types";
import { usePageTitle } from "@/lib/usePageTitle";

type NoticeVariant = "success" | "info" | "warning" | "error";

type ProviderFormState = {
  primary_llm_provider: string;
  selection_llm_provider: string;
  openai_model: string;
  deepseek_model: string;
  openai_compatible_model: string;
  openai_compatible_base_url: string;
  libretranslate_api_url: string;
};

type SecretDraftState = {
  openai_api_key: string;
  deepseek_api_key: string;
  openai_compatible_api_key: string;
  semantic_scholar_api_key: string;
  github_token: string;
  libretranslate_api_key: string;
};

const emptySecrets: SecretDraftState = {
  openai_api_key: "",
  deepseek_api_key: "",
  openai_compatible_api_key: "",
  semantic_scholar_api_key: "",
  github_token: "",
  libretranslate_api_key: "",
};

const providerOptions = [
  { value: "fallback", label: "本地兜底" },
  { value: "openai", label: "OpenAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai_compatible", label: "OpenAI 兼容网关" },
];

export default function SettingsRoute() {
  usePageTitle("设置");

  const queryClient = useQueryClient();
  const runtimeConfig = useRuntimeConfig();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeVariant, setNoticeVariant] = useState<NoticeVariant>("success");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<ProviderFormState>({
    primary_llm_provider: "openai",
    selection_llm_provider: "deepseek",
    openai_model: "",
    deepseek_model: "",
    openai_compatible_model: "",
    openai_compatible_base_url: "",
    libretranslate_api_url: "",
  });
  const [secrets, setSecrets] = useState<SecretDraftState>(emptySecrets);
  const [clearSecrets, setClearSecrets] = useState<Record<keyof SecretDraftState, boolean>>({
    openai_api_key: false,
    deepseek_api_key: false,
    openai_compatible_api_key: false,
    semantic_scholar_api_key: false,
    github_token: false,
    libretranslate_api_key: false,
  });

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.provider(),
    queryFn: ({ signal }) => providerSettings({ signal }),
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setForm({
      primary_llm_provider: settingsQuery.data.primary_llm_provider,
      selection_llm_provider: settingsQuery.data.selection_llm_provider,
      openai_model: settingsQuery.data.openai_model,
      deepseek_model: settingsQuery.data.deepseek_model,
      openai_compatible_model: settingsQuery.data.openai_compatible_model,
      openai_compatible_base_url: settingsQuery.data.openai_compatible_base_url,
      libretranslate_api_url: settingsQuery.data.libretranslate_api_url,
    });
    setSecrets(emptySecrets);
    setClearSecrets({
      openai_api_key: false,
      deepseek_api_key: false,
      openai_compatible_api_key: false,
      semantic_scholar_api_key: false,
      github_token: false,
      libretranslate_api_key: false,
    });
  }, [settingsQuery.data]);

  async function runDesktopAction(
    action: string,
    task: () => Promise<unknown>,
    successMessage: string,
    options?: { reloadSettings?: boolean },
  ) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(successMessage);
      setNoticeVariant("success");
      if (options?.reloadSettings) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.settings.provider() });
      }
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusy("");
    }
  }

  function setFormField<K extends keyof ProviderFormState>(key: K, value: ProviderFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setSecretField<K extends keyof SecretDraftState>(key: K, value: SecretDraftState[K]) {
    setSecrets((current) => ({ ...current, [key]: value }));
    if (value.trim()) {
      setClearSecrets((current) => ({ ...current, [key]: false }));
    }
  }

  function toggleClearSecret(key: keyof SecretDraftState) {
    setClearSecrets((current) => ({ ...current, [key]: !current[key] }));
    setSecrets((current) => ({ ...current, [key]: "" }));
  }

  function secretStatus(configured: boolean, clearing: boolean) {
    if (clearing) return "已标记为保存时清除";
    return configured ? "已保存" : "未配置";
  }

  async function saveProviderConfig() {
    setBusy("save-provider-config");
    setError("");
    setNotice("");

    const payload: ProviderSettingsUpdate = {
      primary_llm_provider: form.primary_llm_provider,
      selection_llm_provider: form.selection_llm_provider,
      openai_model: form.openai_model.trim(),
      deepseek_model: form.deepseek_model.trim(),
      openai_compatible_model: form.openai_compatible_model.trim(),
      openai_compatible_base_url: form.openai_compatible_base_url.trim(),
      libretranslate_api_url: form.libretranslate_api_url.trim(),
    };

    (Object.keys(secrets) as Array<keyof SecretDraftState>).forEach((key) => {
      const value = secrets[key].trim();
      if (clearSecrets[key]) {
        payload[key] = "";
      } else if (value) {
        payload[key] = value;
      }
    });

    try {
      const updated = await updateProviderSettings(payload);
      queryClient.setQueryData(queryKeys.settings.provider(), updated);
      setNotice("模型配置已保存。Provider 和 Token 会优先按新配置立即生效；若桌面后端状态异常，再手动点一次“重启后端”。");
      setNoticeVariant("success");
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy("");
    }
  }

  const settings = settingsQuery.data;

  return (
    <>
      <Card className="page-header-card">
        <span className="page-kicker">桌面配置</span>
        <h2 className="page-shell-title">设置</h2>
        <p className="page-shell-copy">
          在这里配置大模型提供方、API Key、兼容网关和桌面运行信息。桌面版会把这些设置保存在你当前应用的数据目录中，不再要求你每次都回终端改环境变量。
        </p>
      </Card>

      <StatusStack
        items={[
          ...(settingsQuery.error ? [{ variant: "error" as const, message: (settingsQuery.error as Error).message || "设置页加载失败。" }] : []),
          ...(error ? [{ variant: "error" as const, message: error }] : []),
          ...(notice ? [{ variant: noticeVariant, message: notice }] : []),
        ]}
      />

      <Card>
        {!settings ? (
          <Loading text="正在加载设置..." />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="reader-meta-card">
              <strong>桌面运行时</strong>
              <div className="subtle">运行形态：{runtimeConfig.is_desktop ? "Tauri 桌面应用" : "浏览器开发模式"}</div>
              <div className="subtle">平台：{runtimeConfig.platform || "unknown"}</div>
              <div className="subtle">API 地址：{runtimeConfig.api_base}</div>
              <div className="subtle">后端状态：{runtimeConfig.backend_status}</div>
              <div className="subtle">当前阶段：{runtimeConfig.backend_stage || "未提供"}</div>
              {runtimeConfig.backend_error ? <div className="subtle">最近错误：{runtimeConfig.backend_error}</div> : null}
              <div className="subtle">桌面数据目录：{runtimeConfig.app_data_dir || "当前不是桌面正式运行态"}</div>
              <div className="subtle">日志目录：{runtimeConfig.logs_dir || "当前不是桌面正式运行态"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <Button
                  className="secondary"
                  type="button"
                  disabled={!runtimeConfig.is_desktop || busy !== ""}
                  onClick={() => void runDesktopAction("open-data-dir", openDataDir, "已打开桌面数据目录。")}
                >
                  {busy === "open-data-dir" ? "打开中..." : "打开数据目录"}
                </Button>
                <Button
                  className="secondary"
                  type="button"
                  disabled={!runtimeConfig.is_desktop || busy !== ""}
                  onClick={() => void runDesktopAction("open-logs-dir", openLogsDir, "已打开日志目录。")}
                >
                  {busy === "open-logs-dir" ? "打开中..." : "打开日志目录"}
                </Button>
                <Button
                  type="button"
                  disabled={!runtimeConfig.is_desktop || busy !== ""}
                  onClick={() =>
                    void runDesktopAction(
                      "restart-backend",
                      () => restartBackend({ waitForReady: true, timeoutMs: 30_000 }),
                      "桌面后端已重启并恢复就绪。",
                      { reloadSettings: true },
                    )
                  }
                >
                  {busy === "restart-backend" ? "重启中..." : "重启后端"}
                </Button>
              </div>
            </div>

            <div className="reader-meta-card" data-testid="desktop-build-card">
              <strong>构建信息</strong>
              <div className="subtle">应用版本：{runtimeConfig.app_version || "0.1.0"}</div>
              <div className="subtle">构建时间：{runtimeConfig.build_timestamp || "未注入"}</div>
              <div className="subtle">Git Commit：{runtimeConfig.git_commit || "未注入"}</div>
              <div className="subtle">构建模式：{runtimeConfig.build_mode || "desktop"}</div>
              <div className="subtle">当前可执行文件：{runtimeConfig.executable_path || "当前不是桌面正式运行态"}</div>
              <div className="subtle" style={{ marginTop: 8 }}>
                日常增量打包用 <code>npm run desktop:build</code>。只有当你怀疑“像旧包”“时间不对”“MSI 被占用”或 sidecar 异常时，再用 <code>npm run desktop:build:fresh</code>。
              </div>
            </div>

            <div className="reader-meta-card">
              <strong>模型接入与密钥</strong>
              <div className="subtle" style={{ marginTop: 6 }}>
                保存后会写入本地桌面配置文件：{settings.runtime_settings_path}
              </div>
              <div className="subtle">当前模式：{settings.llm_mode === "provider" ? "已启用外部模型提供方" : "本地兜底模式"}</div>

              <div className="grid-2" style={{ marginTop: 12 }}>
                <label className="projects-field">
                  <span>主模型优先来源</span>
                  <select
                    className="select"
                    value={form.primary_llm_provider}
                    onChange={(event) => setFormField("primary_llm_provider", event.target.value)}
                  >
                    {providerOptions.map((option) => (
                      <option key={`primary-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="projects-field">
                  <span>轻量翻译/选词优先来源</span>
                  <select
                    className="select"
                    value={form.selection_llm_provider}
                    onChange={(event) => setFormField("selection_llm_provider", event.target.value)}
                  >
                    {providerOptions.map((option) => (
                      <option key={`selection-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid-2" style={{ marginTop: 12 }}>
                <div className="reader-meta-card">
                  <strong>OpenAI</strong>
                  <div className="subtle">状态：{settings.openai_enabled ? `已启用 · ${settings.openai_model}` : "未启用"}</div>
                  <div className="subtle">Key：{secretStatus(settings.openai_api_key_configured, clearSecrets.openai_api_key)}</div>
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    <label className="projects-field">
                      <span>模型名</span>
                      <input className="input" value={form.openai_model} onChange={(event) => setFormField("openai_model", event.target.value)} />
                    </label>
                    <label className="projects-field">
                      <span>API Key</span>
                      <input
                        className="input"
                        type="password"
                        value={secrets.openai_api_key}
                        onChange={(event) => setSecretField("openai_api_key", event.target.value)}
                        placeholder={settings.openai_api_key_configured ? "已保存，留空表示保持不变" : "输入新的 OpenAI API Key"}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        className="secondary"
                        type="button"
                        disabled={busy !== "" || !settings.openai_api_key_configured}
                        onClick={() => toggleClearSecret("openai_api_key")}
                      >
                        {clearSecrets.openai_api_key ? "已标记清除 OpenAI Key" : "清除已保存 OpenAI Key"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="reader-meta-card">
                  <strong>DeepSeek</strong>
                  <div className="subtle">状态：{settings.deepseek_enabled ? `已启用 · ${settings.deepseek_model}` : "未启用"}</div>
                  <div className="subtle">Key：{secretStatus(settings.deepseek_api_key_configured, clearSecrets.deepseek_api_key)}</div>
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    <label className="projects-field">
                      <span>模型名</span>
                      <input className="input" value={form.deepseek_model} onChange={(event) => setFormField("deepseek_model", event.target.value)} />
                    </label>
                    <label className="projects-field">
                      <span>API Key</span>
                      <input
                        className="input"
                        type="password"
                        value={secrets.deepseek_api_key}
                        onChange={(event) => setSecretField("deepseek_api_key", event.target.value)}
                        placeholder={settings.deepseek_api_key_configured ? "已保存，留空表示保持不变" : "输入新的 DeepSeek API Key"}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        className="secondary"
                        type="button"
                        disabled={busy !== "" || !settings.deepseek_api_key_configured}
                        onClick={() => toggleClearSecret("deepseek_api_key")}
                      >
                        {clearSecrets.deepseek_api_key ? "已标记清除 DeepSeek Key" : "清除已保存 DeepSeek Key"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="reader-meta-card">
                  <strong>OpenAI 兼容网关</strong>
                  <div className="subtle">
                    状态：{settings.openai_compatible_enabled ? `已启用 · ${settings.openai_compatible_model}` : "未启用"}
                  </div>
                  <div className="subtle">Key：{secretStatus(settings.openai_compatible_api_key_configured, clearSecrets.openai_compatible_api_key)}</div>
                  <div className="subtle">适用于像 bltcy.ai 这类兼容 OpenAI 请求格式的服务。</div>
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    <label className="projects-field">
                      <span>Base URL</span>
                      <input
                        className="input"
                        value={form.openai_compatible_base_url}
                        onChange={(event) => setFormField("openai_compatible_base_url", event.target.value)}
                        placeholder="例如：https://api.bltcy.ai"
                      />
                    </label>
                    <label className="projects-field">
                      <span>模型名</span>
                      <input
                        className="input"
                        value={form.openai_compatible_model}
                        onChange={(event) => setFormField("openai_compatible_model", event.target.value)}
                        placeholder="例如：claude"
                      />
                    </label>
                    <label className="projects-field">
                      <span>API Key</span>
                      <input
                        className="input"
                        type="password"
                        value={secrets.openai_compatible_api_key}
                        onChange={(event) => setSecretField("openai_compatible_api_key", event.target.value)}
                        placeholder={settings.openai_compatible_api_key_configured ? "已保存，留空表示保持不变" : "输入兼容网关 API Key"}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        className="secondary"
                        type="button"
                        disabled={busy !== "" || !settings.openai_compatible_api_key_configured}
                        onClick={() => toggleClearSecret("openai_compatible_api_key")}
                      >
                        {clearSecrets.openai_compatible_api_key ? "已标记清除网关 Key" : "清除已保存网关 Key"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="reader-meta-card">
                  <strong>检索与仓库辅助配置</strong>
                  <div className="subtle">Semantic Scholar API Key：{secretStatus(settings.semantic_scholar_api_key_configured, clearSecrets.semantic_scholar_api_key)}</div>
                  <div className="subtle">GitHub Token：{secretStatus(settings.github_token_configured, clearSecrets.github_token)}</div>
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    <label className="projects-field">
                      <span>Semantic Scholar API Key</span>
                      <input
                        className="input"
                        type="password"
                        value={secrets.semantic_scholar_api_key}
                        onChange={(event) => setSecretField("semantic_scholar_api_key", event.target.value)}
                        placeholder={settings.semantic_scholar_api_key_configured ? "已保存，留空表示保持不变" : "可选，用于提升检索额度"}
                      />
                    </label>
                    <label className="projects-field">
                      <span>GitHub Token</span>
                      <input
                        className="input"
                        type="password"
                        value={secrets.github_token}
                        onChange={(event) => setSecretField("github_token", event.target.value)}
                        placeholder={settings.github_token_configured ? "已保存，留空表示保持不变" : "可选，用于提高 GitHub 调用额度"}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        className="secondary"
                        type="button"
                        disabled={busy !== "" || !settings.semantic_scholar_api_key_configured}
                        onClick={() => toggleClearSecret("semantic_scholar_api_key")}
                      >
                        {clearSecrets.semantic_scholar_api_key ? "已标记清除 Semantic Scholar Key" : "清除 Semantic Scholar Key"}
                      </Button>
                      <Button
                        className="secondary"
                        type="button"
                        disabled={busy !== "" || !settings.github_token_configured}
                        onClick={() => toggleClearSecret("github_token")}
                      >
                        {clearSecrets.github_token ? "已标记清除 GitHub Token" : "清除 GitHub Token"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="reader-meta-card" style={{ marginTop: 12 }}>
                <strong>翻译兜底接口</strong>
                <div className="subtle">当前状态：{settings.libretranslate_enabled ? `已配置 · ${settings.libretranslate_api_url}` : "未配置"}</div>
                <div className="subtle">API Key：{secretStatus(settings.libretranslate_api_key_configured, clearSecrets.libretranslate_api_key)}</div>
                <div className="grid-2" style={{ marginTop: 10 }}>
                  <label className="projects-field">
                    <span>LibreTranslate URL</span>
                    <input
                      className="input"
                      value={form.libretranslate_api_url}
                      onChange={(event) => setFormField("libretranslate_api_url", event.target.value)}
                      placeholder="可留空以关闭翻译兜底"
                    />
                  </label>
                  <label className="projects-field">
                    <span>LibreTranslate API Key</span>
                    <input
                      className="input"
                      type="password"
                      value={secrets.libretranslate_api_key}
                      onChange={(event) => setSecretField("libretranslate_api_key", event.target.value)}
                      placeholder={settings.libretranslate_api_key_configured ? "已保存，留空表示保持不变" : "可选"}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <Button
                    className="secondary"
                    type="button"
                    disabled={busy !== "" || !settings.libretranslate_api_key_configured}
                    onClick={() => toggleClearSecret("libretranslate_api_key")}
                  >
                    {clearSecrets.libretranslate_api_key ? "已标记清除翻译 Key" : "清除已保存翻译 Key"}
                  </Button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Button type="button" disabled={busy !== ""} onClick={() => void saveProviderConfig()}>
                  {busy === "save-provider-config" ? "保存中..." : "保存模型与 API 配置"}
                </Button>
                <Button
                  className="secondary"
                  type="button"
                  disabled={!runtimeConfig.is_desktop || busy !== ""}
                  onClick={() =>
                    void runDesktopAction(
                      "restart-backend-after-save",
                      () => restartBackend({ waitForReady: true, timeoutMs: 30_000 }),
                      "桌面后端已按当前设置重启。",
                      { reloadSettings: true },
                    )
                  }
                >
                  {busy === "restart-backend-after-save" ? "重启中..." : "按当前设置重启后端"}
                </Button>
              </div>
            </div>

            <div className="reader-meta-card" data-testid="runtime-settings-card">
              <strong>后端运行路径</strong>
              <div className="subtle">数据库 URL：{settings.runtime_db_url}</div>
              <div className="subtle">数据库路径：{settings.runtime_db_path || "当前使用内存数据库或非 SQLite"}</div>
              <div className="subtle">后端数据目录：{settings.runtime_data_dir}</div>
              <div className="subtle">向量目录：{settings.runtime_vector_dir}</div>
            </div>

            <div className="reader-meta-card" data-testid="test-db-note">
              <strong>数据与测试说明</strong>
              <div className="subtle">桌面版正式数据写入用户目录，与仓库开发数据隔离。</div>
              <div className="subtle">本期不导入仓库里的旧 <code>backend/data</code>，也不自动迁移历史项目。</div>
              <div className="subtle">pytest 和 Playwright E2E 默认使用临时数据库，不会污染你当前开发中的数据。</div>
              <div className="subtle"><code>frontend/src-tauri/target</code> 是桌面构建缓存主目录，日常不用手动删除；只有异常时再用 fresh build。</div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <strong>当前说明</strong>
              {settings.notes.map((note) => (
                <div key={note} className="reader-meta-card">
                  <div className="subtle">{note}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
