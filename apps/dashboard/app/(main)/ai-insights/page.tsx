"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { getAIInsights, generateAIInsights } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, AlertTriangle, Wrench, TrendingUp, Activity, RefreshCw } from "lucide-react";

export default function AIInsightsPage() {
  const { data: insights, isLoading, refetch } = useQuery({
    queryKey: ["ai-insights"],
    queryFn: getAIInsights,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: generateAIInsights,
    onSuccess: () => refetch(),
  });

  const healthColor = (status: string) => {
    switch (status) {
      case "healthy": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "needs-attention": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "critical": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BrainCircuit className="h-8 w-8 text-primary" />
            AI Insights
          </h1>
          <p className="text-muted-foreground">AI-powered analysis of your test health and quality</p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          {generateMutation.isPending ? "Generating..." : "Regenerate"}
        </Button>
      </div>

      {isLoading || generateMutation.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : insights ? (
        <>
          {/* Health Status + Executive Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Executive Summary
                </CardTitle>
                <Badge className={healthColor(insights.healthStatus)}>
                  {insights.healthStatus.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{insights.executiveSummary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Generated: {new Date(insights.generatedAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          {/* Top Risks + Priority Fixes side-by-side */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Risks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  Top Risks ({insights.topRisks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {insights.topRisks.length > 0 ? (
                  <ul className="space-y-2">
                    {insights.topRisks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 h-5 w-5 rounded-full bg-red-100 dark:bg-red-900 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {i + 1}
                        </span>
                        {risk}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No critical risks identified</p>
                )}
              </CardContent>
            </Card>

            {/* Priority Fixes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-600">
                  <Wrench className="h-5 w-5" />
                  Priority Fixes ({insights.priorityFixes.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {insights.priorityFixes.length > 0 ? (
                  <ul className="space-y-3">
                    {insights.priorityFixes.map((fix, i) => (
                      <li key={i} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{fix.test}</span>
                          <Badge
                            variant={
                              fix.priority === "high" ? "destructive" :
                              fix.priority === "medium" ? "default" : "secondary"
                            }
                          >
                            {fix.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{fix.fix}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No fixes needed</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Flakiness Warnings */}
          {insights.flakinessWarnings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <TrendingUp className="h-5 w-5" />
                  Flakiness Warnings ({insights.flakinessWarnings.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.flakinessWarnings.map((w, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-3">
                      <span className="font-medium text-sm">{w.test}</span>
                      <span className="text-xs text-muted-foreground">{w.pattern}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Coverage Gaps */}
          {insights.coverageGaps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Coverage Gaps ({insights.coverageGaps.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {insights.coverageGaps.map((gap, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {gap}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <BrainCircuit className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No AI Insights Yet</h2>
            <p className="text-muted-foreground mb-4">
              Run some test suites first, then generate AI-powered analysis of your test health.
            </p>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <BrainCircuit className="mr-2 h-4 w-4" />
              Generate Insights
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
