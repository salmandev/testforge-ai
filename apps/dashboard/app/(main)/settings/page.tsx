"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Save, Key, Shield, Bell } from "lucide-react";
import type { UserSettings } from "@/lib/types";

const SETTINGS_KEY = "testforge_settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        setSettings(JSON.parse(stored) as UserSettings);
      } catch { /* ignore */ }
    }
  }, []);

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure API keys, credentials, and notifications</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          {saved ? "Saved!" : "Save"}
        </Button>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> API Keys</CardTitle>
          <CardDescription>Configure AI provider credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Anthropic API Key</Label>
            <Input
              type="password"
              value={settings.anthropicKey ?? ""}
              onChange={(e) => update("anthropicKey", e.target.value)}
              placeholder="sk-ant-..."
            />
          </div>
          <div className="space-y-2">
            <Label>Ollama URL</Label>
            <Input
              value={settings.ollamaUrl ?? ""}
              onChange={(e) => update("ollamaUrl", e.target.value)}
              placeholder="http://localhost:11434"
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Azure AD */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Azure AD</CardTitle>
          <CardDescription>Configure Azure Active Directory for D365 integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tenant ID</Label>
              <Input
                value={settings.azureTenantId ?? ""}
                onChange={(e) => update("azureTenantId", e.target.value)}
                placeholder="Azure AD tenant ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Client ID</Label>
              <Input
                value={settings.azureClientId ?? ""}
                onChange={(e) => update("azureClientId", e.target.value)}
                placeholder="Application client ID"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <Input
              type="password"
              value={settings.azureClientSecret ?? ""}
              onChange={(e) => update("azureClientSecret", e.target.value)}
              placeholder="Client secret"
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
          <CardDescription>Configure notification channels</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Slack Webhook URL</Label>
            <Input
              value={settings.slackWebhook ?? ""}
              onChange={(e) => update("slackWebhook", e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>
          <div className="space-y-2">
            <Label>Teams Webhook URL</Label>
            <Input
              value={settings.teamsWebhook ?? ""}
              onChange={(e) => update("teamsWebhook", e.target.value)}
              placeholder="https://outlook.office.com/webhook/..."
            />
          </div>
          <div className="space-y-2">
            <Label>Email Recipients (comma separated)</Label>
            <Input
              value={(settings.emailRecipients ?? []).join(", ")}
              onChange={(e) => update("emailRecipients", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              placeholder="qa@testforge.ai, dev@testforge.ai"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
