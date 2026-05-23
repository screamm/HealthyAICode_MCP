// packages/mcp-server/src/tools/calibration-status.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

export function registerCalibrationStatus(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_calibration_status',
    'Visar kalibreringsstatus för alla stödda språk — vilka språk som har empirisk kalibrering, version, datasetinformation och om data är en platshållare eller empiriskt validerad.',
    {
      calibrationDir: z.string().optional().describe(
        'Sökväg till kalibreringskatalogen. Default: <cwd>/packages/core/calibration/'
      ),
    },
    async (args) => handleCalibrationStatus(args.calibrationDir as string | undefined),
  );
}

const SUPPORTED_LANGUAGES = ['java', 'kotlin', 'typescript', 'javascript', 'python', 'csharp'] as const;

interface CalibrationEntry {
  language: string;
  hasCalibration: boolean;
  version?: string;
  generatedAt?: string;
  datasetVersion?: string;
  thresholdCount?: number;
  weightCount?: number;
  f1Score?: number | null;
  aucScore?: number | null;
  isPlaceholder: boolean;
  fileSizeKb?: number;
}

export async function handleCalibrationStatus(
  calibrationDir?: string,
): Promise<{ content: { type: string; text: string }[] }> {
  const dir = calibrationDir
    ? resolve(calibrationDir)
    : resolve(process.cwd(), 'packages', 'core', 'calibration');

  const entries: CalibrationEntry[] = [];

  for (const lang of SUPPORTED_LANGUAGES) {
    const filePath = join(dir, `${lang}.json`);

    if (!existsSync(filePath)) {
      entries.push({ language: lang, hasCalibration: false, isPlaceholder: false });
      continue;
    }

    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      const fileSize = statSync(filePath).size;

      // Detect placeholder: either explicit note contains 'placeholder', datasetVersion mentions it,
      // or metrics have null f1Score and null aucScore.
      const isPlaceholder =
        (typeof raw.datasetVersion === 'string' && raw.datasetVersion.toLowerCase().includes('placeholder')) ||
        (typeof raw.metrics?.note === 'string' && raw.metrics.note.toLowerCase().includes('placeholder')) ||
        (raw.metrics?.f1Score === null && raw.metrics?.aucScore === null && !raw.metrics?.trainSize);

      const thresholdCount = raw.thresholds ? Object.keys(raw.thresholds).length : 0;
      const weightCount = raw.weights ? Object.keys(raw.weights).length : 0;

      entries.push({
        language: lang,
        hasCalibration: true,
        version: raw.version,
        generatedAt: raw.generatedAt,
        datasetVersion: raw.datasetVersion,
        thresholdCount,
        weightCount,
        f1Score: raw.metrics?.f1Score ?? null,
        aucScore: raw.metrics?.aucScore ?? null,
        isPlaceholder,
        fileSizeKb: Math.round((fileSize / 1024) * 10) / 10,
      });
    } catch {
      // Malformed JSON — report as present but treat as placeholder
      entries.push({ language: lang, hasCalibration: true, isPlaceholder: true });
    }
  }

  const empiricalCount = entries.filter(e => e.hasCalibration && !e.isPlaceholder).length;
  const placeholderCount = entries.filter(e => e.hasCalibration && e.isPlaceholder).length;
  const missingCount = entries.filter(e => !e.hasCalibration).length;

  const summary = {
    calibrationDir: dir,
    summary: {
      empiricallyCalibrated: empiricalCount,
      placeholderOnly: placeholderCount,
      notCalibrated: missingCount,
      totalLanguages: SUPPORTED_LANGUAGES.length,
    },
    languages: entries,
    recommendation: buildRecommendation(empiricalCount, placeholderCount),
  };

  return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
}

function buildRecommendation(empirical: number, placeholder: number): string {
  if (empirical >= 3) {
    return 'Kalibreringen är stark. Aktivera med set_config useCalibratedThresholds true.';
  }
  if (empirical >= 1) {
    return 'Partiell kalibrering tillgänglig. Kör multi-lang-corpus.mjs för fler språk.';
  }
  if (placeholder > 0) {
    return 'Endast placeholder-data tillgänglig. Kör kalibreringspipelinen för empiriska värden.';
  }
  return 'Ingen kalibrering tillgänglig. Hårdkodade defaults används oavsett useCalibratedThresholds.';
}
