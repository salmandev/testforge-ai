"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSuites, createSuite, deleteSuite } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, GripVertical, ChevronLeft, ArrowUp, ArrowDown } from "lucide-react";

const D365_MODULES = ["Sales", "Service", "Marketing", "Finance", "Supply Chain", "Custom"] as const;

interface TestStep {
  id: string;
  action: string;
  target: string;
  value?: string;
}

interface TestCaseItem {
  id: string;
  name: string;
  type: string;
  priority: string;
  steps: TestStep[];
}

// Mock test cases for suite editor demo
const MOCK_TEST_CASES: TestCaseItem[] = [
  { id: "tc-1", name: "Login with valid credentials", type: "WEB", priority: "CRITICAL", steps: [
    { id: "s1", action: "navigate", target: "/login" },
    { id: "s2", action: "type", target: "#email", value: "user@example.com" },
    { id: "s3", action: "type", target: "#password", value: "***" },
    { id: "s4", action: "click", target: "button[type=submit]" },
    { id: "s5", action: "assert", target: "url", value: "/dashboard" },
  ]},
  { id: "tc-2", name: "Create new account record", type: "WEB", priority: "HIGH", steps: [
    { id: "s1", action: "navigate", target: "/accounts/new" },
    { id: "s2", action: "type", target: "#name", value: "Test Account" },
    { id: "s3", action: "click", target: "#save-btn" },
    { id: "s4", action: "assert", target: ".toast", value: "Account created" },
  ]},
  { id: "tc-3", name: "API: GET /api/projects", type: "API", priority: "MEDIUM", steps: [
    { id: "s1", action: "request", target: "GET /api/projects" },
    { id: "s2", action: "assert", target: "status", value: "200" },
  ]},
];

export default function SuitesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [module, setModule] = useState("");
  const [selectedTestCase, setSelectedTestCase] = useState<TestCaseItem | null>(null);
  const [editingSteps, setEditingSteps] = useState<TestStep[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const { data: suites, isLoading } = useQuery({
    queryKey: ["suites"],
    queryFn: getSuites,
  });

  const createMutation = useMutation({
    mutationFn: createSuite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suites"] });
      setDialogOpen(false);
      setName("");
      setDescription("");
      setModule("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSuite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suites"] }),
  });

  const handleCreate = () => {
    createMutation.mutate({ name, description: description || undefined, module: module || undefined });
  };

  const selectTestCase = useCallback((tc: TestCaseItem) => {
    setSelectedTestCase(tc);
    setEditingSteps([...tc.steps]);
  }, []);

  // Drag-and-drop reorder handlers (native HTML5 DnD — replaces @dnd-kit for zero extra deps)
  const handleDragStart = (index: number) => setDragIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setEditingSteps((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      if (moved) updated.splice(index, 0, moved);
      return updated;
    });
    setDragIndex(index);
  };

  const handleDragEnd = () => setDragIndex(null);

  const addStep = () => {
    setEditingSteps((prev) => [
      ...prev,
      { id: `s-${Date.now()}`, action: "click", target: "", value: "" },
    ]);
  };

  const removeStep = (index: number) => {
    setEditingSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    setEditingSteps((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const arr = [...prev];
      const a = arr[index] as TestStep;
      const b = arr[targetIndex] as TestStep;
      arr[index] = b;
      arr[targetIndex] = a;
      return arr;
    });
  };

  const updateStep = (index: number, field: keyof TestStep, value: string) => {
    setEditingSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Test Suites</h1>
          <p className="text-muted-foreground">Manage suites, edit test cases, and reorder steps</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Suite</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Test Suite</DialogTitle>
              <DialogDescription>Create a new test suite and assign a D365 module.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Suite name" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
              </div>
              <div className="space-y-2">
                <Label>D365 Module</Label>
                <Select value={module} onValueChange={setModule}>
                  <SelectTrigger><SelectValue placeholder="Select module" /></SelectTrigger>
                  <SelectContent>
                    {D365_MODULES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={!name || createMutation.isPending} className="w-full">
                {createMutation.isPending ? "Creating..." : "Create Suite"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Suite Editor: Split Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Test Case List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Test Cases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {MOCK_TEST_CASES.map((tc) => (
              <button
                key={tc.id}
                onClick={() => selectTestCase(tc)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedTestCase?.id === tc.id
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{tc.name}</span>
                  <Badge variant={tc.priority === "CRITICAL" ? "destructive" : "secondary"} className="text-xs ml-2 shrink-0">
                    {tc.priority}
                  </Badge>
                </div>
                <div className="flex gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{tc.type}</Badge>
                  <span className="text-xs text-muted-foreground">{tc.steps.length} steps</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Right Panel: Step Editor */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {selectedTestCase ? (
                  <>
                    <button onClick={() => setSelectedTestCase(null)} className="mr-2 inline-flex">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {selectedTestCase.name} — Steps
                  </>
                ) : (
                  "Select a test case to edit steps"
                )}
              </CardTitle>
              {selectedTestCase && (
                <Button size="sm" onClick={addStep}>
                  <Plus className="mr-1 h-3 w-3" /> Add Step
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedTestCase ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                <p>Click a test case on the left to view and edit its steps.</p>
              </div>
            ) : editingSteps.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <p>No steps defined yet.</p>
                <Button size="sm" variant="outline" onClick={addStep}>
                  <Plus className="mr-1 h-3 w-3" /> Add First Step
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {editingSteps.map((step, index) => (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 rounded-lg border p-3 transition-all ${
                      dragIndex === index ? "border-primary bg-primary/5 scale-[0.98]" : "bg-card"
                    }`}
                  >
                    {/* Drag Handle */}
                    <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                      <GripVertical className="h-4 w-4" />
                    </div>

                    {/* Step Number */}
                    <span className="text-xs font-mono text-muted-foreground w-6 text-center shrink-0">
                      {index + 1}
                    </span>

                    {/* Action */}
                    <Select value={step.action} onValueChange={(v) => updateStep(index, "action", v)}>
                      <SelectTrigger className="w-28 h-8 text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["click", "type", "navigate", "assert", "wait", "request", "hover", "scroll"].map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Target */}
                    <Input
                      value={step.target}
                      onChange={(e) => updateStep(index, "target", e.target.value)}
                      placeholder="target / selector"
                      className="h-8 text-xs flex-1"
                    />

                    {/* Value */}
                    {["type", "assert", "wait"].includes(step.action) && (
                      <Input
                        value={step.value ?? ""}
                        onChange={(e) => updateStep(index, "value", e.target.value)}
                        placeholder="value"
                        className="h-8 text-xs w-32 shrink-0"
                      />
                    )}

                    {/* Reorder Buttons */}
                    <div className="flex flex-col shrink-0">
                      <button onClick={() => moveStep(index, "up")} disabled={index === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => moveStep(index, "down")} disabled={index === editingSteps.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Remove */}
                    <button onClick={() => removeStep(index)} className="p-1 text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Suites List */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">All Suites</h3>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(suites ?? []).map((suite) => (
                <Card key={suite.id} className="relative group">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{suite.name}</h4>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="secondary">{suite.testCount} tests</Badge>
                          {suite.module && <Badge variant="outline">{suite.module}</Badge>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(suite.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!suites || suites.length === 0) && (
                <p className="text-center text-muted-foreground col-span-full py-8">No suites yet. Create one above.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
