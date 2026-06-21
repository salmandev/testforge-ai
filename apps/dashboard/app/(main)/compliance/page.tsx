"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getComplianceFrameworks, runComplianceAudit } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Play } from "lucide-react";
import type { ComplianceResult } from "@/lib/types";

export default function CompliancePage() {
  const [selectedFramework, setSelectedFramework] = useState("");
  const [lastResult, setLastResult] = useState<ComplianceResult | null>(null);

  const { data: frameworks, isLoading } = useQuery({
    queryKey: ["compliance-frameworks"],
    queryFn: getComplianceFrameworks,
  });

  const auditMutation = useMutation({
    mutationFn: runComplianceAudit,
    onSuccess: (data) => setLastResult(data),
  });

  const handleRunAudit = () => {
    if (!selectedFramework) return;
    auditMutation.mutate({ framework: selectedFramework });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "compliant": return "text-green-600";
      case "partial": return "text-yellow-600";
      case "non-compliant": return "text-red-600";
      default: return "text-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Compliance</h1>
          <p className="text-muted-foreground">
            Regulatory compliance audit — الامتثال التنظيمي
          </p>
        </div>
      </div>

      {/* Framework Selector + Run */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Run Compliance Audit / تشغيل مراجعة الامتثال
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Select value={selectedFramework} onValueChange={setSelectedFramework}>
                <SelectTrigger><SelectValue placeholder="Select framework / اختر الإطار" /></SelectTrigger>
                <SelectContent>
                  {(frameworks ?? []).map((fw) => (
                    <SelectItem key={fw.id} value={fw.id}>
                      {fw.name} ({fw.region}) — {fw.totalControls} controls
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleRunAudit} disabled={!selectedFramework || auditMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {auditMutation.isPending ? "Running..." : "Run Audit"}
            </Button>
          </div>

          {/* Available frameworks list */}
          {isLoading ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {(frameworks ?? []).map((fw) => (
                <div key={fw.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <ShieldCheck className="h-8 w-8 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{fw.name}</p>
                    <p className="text-xs text-muted-foreground">{fw.region} — {fw.totalControls} controls</p>
                    {fw.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{fw.name_ar}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {lastResult && (
        <>
          {/* Donut Chart */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardContent className="pt-6 flex flex-col items-center">
                <div className="text-4xl font-bold text-primary mb-2">
                  {lastResult.compliancePercentage}%
                </div>
                <p className="text-sm text-muted-foreground">Compliance Score</p>
                {/* CSS donut */}
                <div
                  className="mt-4 w-32 h-32 rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(
                      #22c55e 0% ${lastResult.compliancePercentage}%,
                      #eab308 ${lastResult.compliancePercentage}% ${lastResult.compliancePercentage + ((lastResult.coverage.filter((c: { status: string }) => c.status === "partial").length / lastResult.totalControls) * 100)}%,
                      #ef4444 ${lastResult.compliancePercentage + ((lastResult.coverage.filter((c: { status: string }) => c.status === "partial").length / lastResult.totalControls) * 100)}% 100%
                    )`,
                  }}
                >
                  <div className="w-24 h-24 rounded-full bg-card flex items-center justify-center">
                    <span className="text-lg font-bold">{lastResult.coveredControls}/{lastResult.totalControls}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>AI Summary / ملخص الذكاء الاصطناعي</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{lastResult.aiSummary}</p>
                <div className="mt-4 grid gap-2 grid-cols-3">
                  <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3 text-center">
                    <CheckCircle2 className="mx-auto h-5 w-5 text-green-600" />
                    <div className="text-lg font-bold text-green-600">
                      {lastResult.coverage.filter((c) => c.status === "compliant").length}
                    </div>
                    <p className="text-xs">Compliant / متوافق</p>
                  </div>
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 p-3 text-center">
                    <AlertTriangle className="mx-auto h-5 w-5 text-yellow-600" />
                    <div className="text-lg font-bold text-yellow-600">
                      {lastResult.coverage.filter((c) => c.status === "partial").length}
                    </div>
                    <p className="text-xs">Partial / جزئي</p>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-center">
                    <XCircle className="mx-auto h-5 w-5 text-red-600" />
                    <div className="text-lg font-bold text-red-600">
                      {lastResult.coverage.filter((c) => c.status === "non-compliant").length}
                    </div>
                    <p className="text-xs">Non-Compliant / غير متوافق</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coverage Table */}
          <Card>
            <CardHeader>
              <CardTitle>Control Coverage / تغطية الضوابط</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Control</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastResult.coverage.filter((c) => c.covered).slice(0, 20).map((c) => (
                    <TableRow key={c.controlId}>
                      <TableCell className="font-mono text-xs">{c.controlId}</TableCell>
                      <TableCell>{c.controlName}</TableCell>
                      <TableCell className={statusColor(c.status)}>
                        <Badge variant="outline" className={statusColor(c.status)}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{c.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Gaps */}
          {lastResult.gaps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Coverage Gaps ({lastResult.gaps.length}) / فجوات التغطية</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {lastResult.gaps.slice(0, 20).map((gap, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      {gap}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
