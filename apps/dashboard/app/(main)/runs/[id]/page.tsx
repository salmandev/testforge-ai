"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { getRun } from "@/lib/api";
import type { TestStepResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, SkipForward, Loader2, Camera, Brain } from "lucide-react";

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const [liveSteps, setLiveSteps] = useState<TestStepResult[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const { data: run, isLoading } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
  });

  useEffect(() => {
    if (!runId) return;
    const wsUrl = `ws://localhost:3000/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: "subscribe", runId }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as TestStepResult;
          setLiveSteps((prev) => [...prev, data]);
        } catch { /* ignore parse errors */ }
      };
      ws.onclose = () => setWsConnected(false);
    } catch {
      setWsConnected(false);
    }
    return () => { ws?.close(); };
  }, [runId]);

  const steps = liveSteps.length > 0 ? liveSteps : (run?.steps ?? []);
  const completedSteps = steps.filter((s) => s.status !== "running").length;
  const progress = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

  const stepIcon = (status: string) => {
    switch (status) {
      case "passed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
      case "skipped": return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      case "running": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default: return null;
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "passed": return "success" as const;
      case "failed": return "destructive" as const;
      case "running": return "default" as const;
      default: return "secondary" as const;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Run {runId}</h1>
          <p className="text-muted-foreground">
            {run?.suiteName} &middot; Started {run ? new Date(run.startedAt).toLocaleString() : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(run?.status ?? "pending")}>{run?.status ?? "pending"}</Badge>
          <Badge variant={wsConnected ? "success" : "secondary"}>
            {wsConnected ? "Live" : "Disconnected"}
          </Badge>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-secondary">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Step Results */}
      <Card>
        <CardHeader>
          <CardTitle>Step Results ({completedSteps}/{steps.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div key={step.stepId ?? idx} className="flex items-start gap-3 rounded-md border p-3">
                {stepIcon(step.status)}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{step.description}</span>
                    <Badge variant={statusVariant(step.status)} className="text-xs">{step.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Action: {step.action}</p>
                  {step.duration !== undefined && (
                    <p className="text-xs text-muted-foreground">{(step.duration / 1000).toFixed(2)}s</p>
                  )}
                  {step.error && (
                    <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">{step.error}</div>
                  )}
                  {step.screenshot && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Camera className="h-3 w-3" /> Screenshot available
                    </div>
                  )}
                  {step.aiAnalysis && (
                    <div className="flex items-start gap-1 rounded bg-primary/10 p-2 text-xs">
                      <Brain className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      <span>{step.aiAnalysis}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {steps.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">No steps recorded yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
