"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getD365Entities, generateD365Tests } from "@/lib/api";
import type { D365Entity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Database, Wand2, ChevronDown, ChevronRight } from "lucide-react";

export default function D365Page() {
  const [orgUrl, setOrgUrl] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [entities, setEntities] = useState<D365Entity[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [naturalLanguage, setNaturalLanguage] = useState("");
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [generatedTests, setGeneratedTests] = useState<unknown[] | null>(null);

  const entityMutation = useMutation({
    mutationFn: () => getD365Entities(orgUrl),
    onSuccess: (data) => setEntities(data),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateD365Tests({
        orgUrl,
        entities: selectedEntities.length > 0 ? selectedEntities : undefined,
        naturalLanguage: naturalLanguage || undefined,
      }),
    onSuccess: (data) => setGeneratedTests(data.tests),
  });

  const toggleEntity = (name: string) => {
    setSelectedEntities((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dynamics 365</h1>
        <p className="text-muted-foreground">Connect orgs, browse entities, and generate tests with AI</p>
      </div>

      <Tabs defaultValue="connection">
        <TabsList>
          <TabsTrigger value="connection">Org Connection</TabsTrigger>
          <TabsTrigger value="entities">Entity Browser</TabsTrigger>
          <TabsTrigger value="generate">AI Test Wizard</TabsTrigger>
        </TabsList>

        {/* Connection Tab */}
        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Organization Connection</CardTitle>
              <CardDescription>Connect to your Dataverse organization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Organization URL</Label>
                  <Input value={orgUrl} onChange={(e) => setOrgUrl(e.target.value)} placeholder="https://myorg.crm.dynamics.com" />
                </div>
                <div className="space-y-2">
                  <Label>Tenant ID</Label>
                  <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Azure AD tenant ID" />
                </div>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Application client ID" />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client secret" />
                </div>
              </div>
              <Button onClick={() => entityMutation.mutate()} disabled={!orgUrl || entityMutation.isPending}>
                {entityMutation.isPending ? "Connecting..." : "Connect & Fetch Entities"}
              </Button>
              {entityMutation.isError && (
                <p className="text-sm text-destructive">Failed to connect. Check your credentials.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Entity Browser Tab */}
        <TabsContent value="entities">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Entity Browser</CardTitle>
              <CardDescription>{entities.length} entities loaded</CardDescription>
            </CardHeader>
            <CardContent>
              {entityMutation.isPending ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : entities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No entities loaded. Connect to an org first.</p>
              ) : (
                <div className="space-y-1">
                  {entities.map((entity) => (
                    <div key={entity.logicalName} className="rounded border">
                      <button
                        className="flex w-full items-center gap-2 p-3 text-left hover:bg-accent"
                        onClick={() => setExpandedEntity(expandedEntity === entity.logicalName ? null : entity.logicalName)}
                      >
                        {expandedEntity === entity.logicalName ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium">{entity.displayName}</span>
                        <Badge variant="outline">{entity.logicalName}</Badge>
                        <span className="ml-auto text-xs text-muted-foreground">{entity.fieldCount} fields</span>
                      </button>
                      {expandedEntity === entity.logicalName && entity.fields && (
                        <div className="border-t bg-muted/50 p-3">
                          <div className="grid gap-1 text-xs">
                            {entity.fields.map((field) => (
                              <div key={field.logicalName} className="flex items-center gap-2">
                                <span className="font-mono">{field.logicalName}</span>
                                <Badge variant="secondary" className="text-xs">{field.fieldType}</Badge>
                                {field.isRequired && <Badge variant="destructive" className="text-xs">required</Badge>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Test Generation Wizard */}
        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5" /> AI Test Generation Wizard</CardTitle>
              <CardDescription>Generate D365 test cases using AI</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Select Entities</Label>
                <div className="flex flex-wrap gap-2">
                  {entities.map((entity) => (
                    <button
                      key={entity.logicalName}
                      onClick={() => toggleEntity(entity.logicalName)}
                      className={`rounded-md border px-3 py-1 text-sm ${selectedEntities.includes(entity.logicalName) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                      {entity.displayName}
                    </button>
                  ))}
                  {entities.length === 0 && <p className="text-sm text-muted-foreground">Connect to an org to see entities</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Natural Language (optional)</Label>
                <Input value={naturalLanguage} onChange={(e) => setNaturalLanguage(e.target.value)} placeholder='e.g. "test the lead qualification process"' />
              </div>
              <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || (!selectedEntities.length && !naturalLanguage)}>
                {generateMutation.isPending ? "Generating..." : "Generate Tests"}
              </Button>
              {generatedTests && (
                <div className="rounded border p-4">
                  <h4 className="mb-2 font-semibold">Generated {generatedTests.length} tests</h4>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(generatedTests, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
