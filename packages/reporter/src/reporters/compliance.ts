import type { ComplianceOutput, ControlCoverage } from "@testforge/ai-engine";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import debug from "debug";

const log = debug("testforge:reporter:compliance-pdf");

/**
 * ComplianceReportReporter generates bilingual (Arabic+English) compliance reports
 *
 * Features:
 * - Bilingual layout (English LTR + Arabic RTL side-by-side or stacked)
 * - Donut chart visualization for compliance percentage
 * - Control-by-control evidence listing
 * - Framework metadata in both languages
 * - Exportable HTML (puppeteer PDF conversion when available)
 *
 * @example
 * ```ts
 * const reporter = new ComplianceReportReporter();
 * const path = await reporter.generate(complianceOutput, { framework: "NCA_ECC" });
 * ```
 */
export class ComplianceReportReporter {
  /**
   * Generate a bilingual compliance report
   */
  async generate(
    output: ComplianceOutput,
    options?: {
      outputPath?: string;
      organizationName?: string;
      organizationName_ar?: string;
      logoPath?: string;
    }
  ): Promise<string> {
    log("Generating compliance report for: %s", output.framework);

    const html = this._generateHtml(output, options);
    const outputPath = options?.outputPath ?? join(
      process.cwd(),
      "reports",
      `compliance-${output.framework}-${Date.now()}.pdf`
    );

    await mkdir(join(outputPath, ".."), { recursive: true });

    // Try puppeteer first, fall back to HTML
    try {
      const puppeteer = await import("puppeteer");
      const browser = await (puppeteer.default ?? puppeteer).launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.pdf({
        path: outputPath,
        format: "A4",
        printBackground: true,
        margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
      });
      await browser.close();
      log("Compliance PDF generated: %s", outputPath);
      return outputPath;
    } catch {
      const htmlPath = outputPath.replace(/\.pdf$/, ".html");
      await writeFile(htmlPath, html);
      log("Compliance report saved as HTML: %s", htmlPath);
      return htmlPath;
    }
  }

  /**
   * Generate bilingual HTML content
   */
  private _generateHtml(
    output: ComplianceOutput,
    options?: {
      organizationName?: string;
      organizationName_ar?: string;
      logoPath?: string;
    }
  ): string {
    const compliantCount = output.coverage.filter((c: ControlCoverage) => c.status === "compliant").length;
    const partialCount = output.coverage.filter((c: ControlCoverage) => c.status === "partial").length;
    const nonCompliantCount = output.coverage.filter((c: ControlCoverage) => c.status === "non-compliant").length;
    const coveredControls = output.coveredControls;
    const totalControls = output.totalControls;
    const percentage = output.compliancePercentage;

    const frameworkNames = this._getFrameworkNames(output.framework);

    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compliance Report — ${frameworkNames.en} / ${frameworkNames.ar}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
    }
    body {
      font-family: 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    .bilingual-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1rem;
      border-bottom: 3px solid #1e40af;
      margin-bottom: 2rem;
    }
    .header-en { text-align: left; }
    .header-ar { text-align: right; direction: rtl; font-family: 'Tahoma', 'Arial', sans-serif; }
    .header-en h1, .header-ar h1 { margin: 0; font-size: 1.25rem; color: #1e40af; }
    .header-en .sub, .header-ar .sub { color: #6b7280; font-size: 0.875rem; }
    .donut-container {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 3rem;
      margin: 2rem 0;
    }
    .donut-chart {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      background: conic-gradient(
        #22c55e 0% ${percentage}%,
        #eab308 ${percentage}% ${percentage + (partialCount / totalControls) * 100}%,
        #ef4444 ${percentage + (partialCount / totalControls) * 100}% ${(percentage + (partialCount / totalControls) * 100 + (nonCompliantCount / totalControls) * 100)}%,
        #e5e7eb ${(percentage + (partialCount / totalControls) * 100 + (nonCompliantCount / totalControls) * 100)}% 100%
      );
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .donut-chart::after {
      content: '${percentage}%';
      position: absolute;
      width: 120px;
      height: 120px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: bold;
      color: #1e40af;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin: 2rem 0;
    }
    .stat-card {
      background: #f9fafb;
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: center;
    }
    .stat-card .num { font-size: 1.5rem; font-weight: bold; }
    .stat-card .lbl { color: #6b7280; font-size: 0.75rem; }
    .stat-card.compliant .num { color: #22c55e; }
    .stat-card.partial .num { color: #eab308; }
    .stat-card.noncompliant .num { color: #ef4444; }
    .stat-card.covered .num { color: #1e40af; }
    .section-title {
      font-size: 1.125rem;
      color: #1e40af;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.5rem;
      margin-top: 2rem;
    }
    .section-title-ar {
      font-size: 1.125rem;
      color: #1e40af;
      direction: rtl;
      text-align: right;
      font-family: 'Tahoma', 'Arial', sans-serif;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.5rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.875rem;
    }
    th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .status-compliant { color: #22c55e; font-weight: 600; }
    .status-partial { color: #eab308; font-weight: 600; }
    .status-non-compliant { color: #ef4444; font-weight: 600; }
    .status-not-applicable { color: #9ca3af; }
    .gap-list { list-style: none; padding: 0; }
    .gap-list li { padding: 0.5rem 0; border-bottom: 1px solid #f3f4f6; }
    .gap-list li::before { content: "⚠️ "; }
    .ai-summary {
      background: #f0f9ff;
      border-left: 4px solid #1e40af;
      padding: 1rem;
      border-radius: 0 0.5rem 0.5rem 0;
      margin: 1rem 0;
    }
    .footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 0.75rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="bilingual-header">
    <div class="header-en">
      <h1>Compliance Audit Report</h1>
      <div class="sub">${frameworkNames.en}</div>
      <div class="sub">${options?.organizationName ?? "TestForge AI"}</div>
      <div class="sub">${new Date().toLocaleDateString("en-US")}</div>
    </div>
    ${options?.logoPath ? `<img src="${options.logoPath}" alt="Logo" style="height:48px">` : ""}
    <div class="header-ar">
      <h1>تقرير مراجعة الامتثال</h1>
      <div class="sub">${frameworkNames.ar}</div>
      <div class="sub">${options?.organizationName_ar ?? "TestForge AI"}</div>
      <div class="sub">${new Date().toLocaleDateString("ar-SA")}</div>
    </div>
  </div>

  <div class="donut-container">
    <div class="donut-chart"></div>
  </div>

  <div class="stats-grid">
    <div class="stat-card covered">
      <div class="num">${coveredControls}/${totalControls}</div>
      <div class="lbl">Covered Controls / الضوابط المشمولة</div>
    </div>
    <div class="stat-card compliant">
      <div class="num">${compliantCount}</div>
      <div class="lbl">Compliant / متوافق</div>
    </div>
    <div class="stat-card partial">
      <div class="num">${partialCount}</div>
      <div class="lbl">Partial / جزئي</div>
    </div>
    <div class="stat-card noncompliant">
      <div class="num">${nonCompliantCount}</div>
      <div class="lbl">Non-Compliant / غير متوافق</div>
    </div>
  </div>

  <h2 class="section-title">AI Summary / ملخص الذكاء الاصطناعي</h2>
  <div class="ai-summary">
    <p>${output.aiSummary}</p>
  </div>

  <h2 class="section-title">Control Coverage Details / تفاصيل تغطية الضوابط</h2>
  <table>
    <tr>
      <th>ID</th>
      <th>Control / الضابط</th>
      <th>Status / الحالة</th>
      <th>Tests / الاختبارات</th>
      <th>Notes / ملاحظات</th>
    </tr>
    ${output.coverage
      .filter((c: ControlCoverage) => c.covered)
      .map((c: ControlCoverage) => `
    <tr>
      <td>${c.controlId}</td>
      <td>${c.controlName}</td>
      <td class="status-${c.status}">${c.status.toUpperCase()}</td>
      <td>${c.testIds.join(", ") || "—"}</td>
      <td>${c.notes || "—"}</td>
    </tr>`).join("")}
  </table>

  ${output.gaps.length > 0 ? `
  <div class="page-break"></div>
  <h2 class="section-title">Coverage Gaps (${output.gaps.length}) / فجوات التغطية</h2>
  <ul class="gap-list">
    ${output.gaps.slice(0, 50).map((g: string) => `<li>${g}</li>`).join("")}
  </ul>
  ` : ""}

  <div class="footer">
    Generated by TestForge AI on ${new Date().toLocaleString()} |
    Framework: ${frameworkNames.en} (${frameworkNames.ar}) |
    ${coveredControls}/${totalControls} controls covered (${percentage}% compliant)
  </div>
</body>
</html>`;
  }

  /**
   * Get bilingual framework names
   */
  private _getFrameworkNames(framework: string): { en: string; ar: string } {
    const names: Record<string, { en: string; ar: string }> = {
      NCA_ECC: { en: "NCA Essential Cybersecurity Controls", ar: "ضوابط الأمن السيبراني الأساسية - الهيئة الوطنية للأمن السيبراني" },
      SAMA_CSF: { en: "SAMA Cybersecurity Framework", ar: "إطار الأمن السيبراني لمؤسسة النقد العربي السعودي" },
      PCI_DSS: { en: "PCI Data Security Standard", ar: "معيار أمان بيانات بطاقات الدفع" },
      GDPR: { en: "General Data Protection Regulation", ar: "اللائحة العامة لحماية البيانات" },
      ISO_27001: { en: "ISO/IEC 27001:2022", ar: "آيزو ٢٧٠٠١:٢٠٢٢" },
      PDPL_SA: { en: "Saudi Personal Data Protection Law", ar: "نظام حماية البيانات الشخصية السعودي" },
    };
    return names[framework] ?? { en: framework, ar: framework };
  }
}
