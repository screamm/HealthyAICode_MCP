import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleCalibrationStatus, registerCalibrationStatus } from '../../src/tools/calibration-status';

const SUPPORTED_LANGUAGES = ['java', 'kotlin', 'typescript', 'javascript', 'python', 'csharp'];

describe('code_health_calibration_status handler', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `cal-status-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('returnerar missing-entry för alla språk när katalogen är tom', async () => {
    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);

    expect(data.summary.notCalibrated).toBe(6);
    expect(data.summary.empiricallyCalibrated).toBe(0);
    expect(data.summary.placeholderOnly).toBe(0);
    expect(data.languages.every((l: { hasCalibration: boolean }) => !l.hasCalibration)).toBe(true);
  });

  it('listar alla 6 stödda språk oavsett hur många filer som finns', async () => {
    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);

    expect(data.languages).toHaveLength(6);
    const langs = data.languages.map((l: { language: string }) => l.language);
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(langs).toContain(lang);
    }
  });

  it('identifierar placeholder korrekt baserat på datasetVersion', async () => {
    writeFileSync(join(testDir, 'python.json'), JSON.stringify({
      language: 'python',
      version: '1.0.0',
      generatedAt: '2026-05-22T00:00:00Z',
      datasetVersion: 'SZZ-heuristic-placeholder (run pipeline for real values)',
      thresholds: { complexMethodThreshold: 8 },
      weights: { ComplexMethod: 1.5 },
      metrics: { f1Score: null, aucScore: null, baselineF1: null },
    }));

    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);
    const pythonEntry = data.languages.find((l: { language: string }) => l.language === 'python');

    expect(pythonEntry.hasCalibration).toBe(true);
    expect(pythonEntry.isPlaceholder).toBe(true);
    expect(data.summary.placeholderOnly).toBe(1);
    expect(data.summary.empiricallyCalibrated).toBe(0);
  });

  it('identifierar empirisk kalibrering korrekt (bugCount > 0 och f1Score set)', async () => {
    writeFileSync(join(testDir, 'java.json'), JSON.stringify({
      language: 'java',
      version: '1.0.0',
      generatedAt: '2026-05-22T00:00:00Z',
      datasetVersion: 'defects4j-v2.0.0',
      thresholds: { complexMethodThreshold: 9 },
      weights: {},
      metrics: { f1Score: 0.41, aucScore: 0.68, baselineF1: 0.29, trainSize: 600, testSize: 235 },
    }));

    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);
    const javaEntry = data.languages.find((l: { language: string }) => l.language === 'java');

    expect(javaEntry.hasCalibration).toBe(true);
    expect(javaEntry.isPlaceholder).toBe(false);
    expect(javaEntry.f1Score).toBe(0.41);
    expect(javaEntry.aucScore).toBe(0.68);
    expect(data.summary.empiricallyCalibrated).toBe(1);
  });

  it('hanterar trasig JSON gracefully utan att kasta', async () => {
    writeFileSync(join(testDir, 'java.json'), '{ invalid json content here');

    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);

    // Should not throw — returns entry with hasCalibration: true but isPlaceholder: true
    const javaEntry = data.languages.find((l: { language: string }) => l.language === 'java');
    expect(javaEntry.hasCalibration).toBe(true);
    expect(javaEntry.isPlaceholder).toBe(true);
  });

  it('returnerar korrekt recommendation för tom katalog (ingen kalibrering)', async () => {
    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);
    expect(data.recommendation).toContain('No calibration');
  });

  it('returnerar korrekt recommendation när endast placeholder-data finns', async () => {
    writeFileSync(join(testDir, 'python.json'), JSON.stringify({
      language: 'python',
      datasetVersion: 'SZZ-heuristic-placeholder',
      thresholds: {},
      weights: {},
      metrics: { f1Score: null, aucScore: null },
    }));

    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);
    expect(data.recommendation).toContain('placeholder');
  });

  it('returnerar korrekt recommendation för partiell kalibrering (1 empirisk)', async () => {
    writeFileSync(join(testDir, 'java.json'), JSON.stringify({
      language: 'java',
      datasetVersion: 'defects4j-v2.0.0',
      thresholds: {},
      weights: {},
      metrics: { f1Score: 0.41, aucScore: 0.68, trainSize: 600 },
    }));

    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);
    expect(data.recommendation).toContain('Partial calibration');
  });

  it('returnerar korrekt recommendation för stark kalibrering (>= 3 empiriska)', async () => {
    for (const lang of ['java', 'python', 'typescript']) {
      writeFileSync(join(testDir, `${lang}.json`), JSON.stringify({
        language: lang,
        datasetVersion: 'RealData-v1.0',
        thresholds: {},
        weights: {},
        metrics: { f1Score: 0.50, aucScore: 0.70, trainSize: 500 },
      }));
    }

    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);
    expect(data.summary.empiricallyCalibrated).toBe(3);
    expect(data.recommendation).toContain('strong');
  });

  it('response-content har type text och är valid JSON', async () => {
    const result = await handleCalibrationStatus(testDir);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('inkluderar calibrationDir i svaret', async () => {
    const result = await handleCalibrationStatus(testDir);
    const data = JSON.parse(result.content[0].text);
    expect(data.calibrationDir).toBeTruthy();
  });

  it('registreras med rätt verktygsnamn via registerCalibrationStatus', () => {
    const registered: string[] = [];
    const mockServer = {
      registerTool: (name: string, _config: unknown, _handler: unknown) => {
        registered.push(name);
      },
    } as any;
    registerCalibrationStatus(mockServer);
    expect(registered).toContain('code_health_calibration_status');
  });
});
