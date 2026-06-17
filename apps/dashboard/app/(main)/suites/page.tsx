"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSuites, createSuite, deleteSuite } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2 } from "lucide-react";

const D365_MODULES = ["Sales", "Service", "Marketing", "Finance", "Supply Chain", "Custom"] as const;

export default function SuitesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [module, setModule] = useState("");

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Test Suites</h1>
          <p className="text-muted-foreground">Manage your test suites and D365 modules</p>
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

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(suites ?? []).map((suite) => (
                  <TableRow key={suite.id}>
                    <TableCell className="font-medium">{suite.name}</TableCell>
                    <TableCell>{suite.testCount}</TableCell>
                    <TableCell>{suite.module ? <Badge variant="outline">{suite.module}</Badge> : "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {suite.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{suite.lastRunAt ? new Date(suite.lastRunAt).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(suite.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!suites || suites.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No suites yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
