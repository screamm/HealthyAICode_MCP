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

/** Resolve the calibration directory path. */
function resolveCalibrationDir(calibrationDir?: string): string {
  return calibrationDir
    ? resolve(calibrationDir)
    : resolve(process.cwd(), 'packages', 'core', 'calibration');
}

/** Determine whether a parsed calibration file is a placeholder. */
function detectIsPlaceholder(raw: Record<string, unknown>): boolean {
  const metrics = raw.metrics as Record<string, unknown> | undefined;
  return (
    (typeof raw.datasetVersion === 'string' && raw.datasetVersion.toLowerCase().includes('placeholder')) ||
    (typeof metrics?.note === 'string' && (metrics.note as string).toLowerCase().includes('placeholder')) ||
    (metrics?.f1Score === null && metrics?.aucScore === null && !metrics?.trainSize)
  );
}

/** Parse a calibration JSON file into a CalibrationEntry. */
function parseCalibrationFile(lang: string, filePath: string): CalibrationEntry {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const fileSize = statSync(filePath).size;
    const isPlaceholder = detectIsPlaceholder(raw);
    const metrics = raw.metrics as Record<string, unknown> | undefined;

    return {
      language: lang,
      hasCalibration: true,
      version: raw.version as string | undefined,
      generatedAt: raw.generatedAt as string | undefined,
      datasetVersion: raw.datasetVersion as string | undefined,
      thresholdCount: raw.thresholds ? Object.keys(raw.thresholds as object).length : 0,
      weightCount: raw.weights ? Object.keys(raw.weights as object).length : 0,
      f1Score: metrics?.f1Score as number | null ?? null,
      aucScore: metrics?.aucScore as number | null ?? null,
      isPlaceholder,
      fileSizeKb: Math.round((fileSize / 1024) * 10) / 10,
    };
  } catch {
    // Malformed JSON — report as present but treat as placeholder
    return { language: lang, hasCalibration: true, isPlaceholder: true };
  }
}

/** Load calibration entries for all supported languages from a directory. */
function loadCalibrationEntries(dir: string): CalibrationEntry[] {
  return SUPPORTED_LANGUAGES.map(lang => {
    const filePath = join(dir, `${lang}.json`);
    if (!existsSync(filePath)) {
      return { language: lang, hasCalibration: false, isPlaceholder: false };
    }
    return parseCalibrationFile(lang, filePath);
  });
}

/** Build summary counts from entries. */
interface CalibrationCounts {
  empiricalCount: number;
  placeholderCount: number;
  missingCount: number;
}

function countCalibrationEntries(entries: CalibrationEntry[]): CalibrationCounts {
  return {
    empiricalCount: entries.filter(e => e.hasCalibration && !e.isPlaceholder).length,
    placeholderCount: entries.filter(e => e.hasCalibration && e.isPlaceholder).length,
    missingCount: entries.filter(e => !e.hasCalibration).length,
  };
}

export async function handleCalibrationStatus(
  calibrationDir?: string,
): Promise<{ content: { type: string; text: string }[] }> {
  const dir = resolveCalibrationDir(calibrationDir);
  const entries = loadCalibrationEntries(dir);
  const { empiricalCount, placeholderCount, missingCount } = countCalibrationEntries(entries);

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
