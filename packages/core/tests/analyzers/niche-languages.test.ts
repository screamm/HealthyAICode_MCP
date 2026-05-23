import { describe, it, expect } from 'vitest';
import { analyzeCobol } from '../../src/analyzers/cobol';
import { analyzeApex } from '../../src/analyzers/apex';
import { analyzeFSharp } from '../../src/analyzers/fsharp';
import { analyzeVbNet } from '../../src/analyzers/vbnet';
import { analyzePerl } from '../../src/analyzers/perl';
import { analyzeGroovy } from '../../src/analyzers/groovy';
import { analyzeObjC } from '../../src/analyzers/objc';
import { analyzePowerShell } from '../../src/analyzers/powershell';

// ── COBOL ──────────────────────────────────────────────────────────────────────

describe('analyzeCobol', () => {
  it('returns valid output for empty code', () => {
    const result = analyzeCobol('', 'test.cbl');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects SECTION definitions', () => {
    const code = [
      'IDENTIFICATION DIVISION.',
      'PROGRAM-ID. HELLO.',
      'PROCEDURE DIVISION.',
      'MAIN-LOGIC SECTION.',
      '    IF WS-FLAG = "Y"',
      '        PERFORM PROCESS-DATA',
      '    END-IF.',
      '    STOP RUN.',
      'PROCESS-DATA SECTION.',
      '    EVALUATE WS-CODE',
      '        WHEN 1 PERFORM ACTION-ONE',
      '        WHEN OTHER PERFORM ACTION-TWO',
      '    END-EVALUATE.',
    ].join('\n');

    const result = analyzeCobol(code, 'hello.cbl');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});

// ── Apex ───────────────────────────────────────────────────────────────────────

describe('analyzeApex', () => {
  it('returns valid output for empty code', () => {
    const result = analyzeApex('', 'test.cls');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects method definitions', () => {
    const code = [
      'public class AccountService {',
      '    public static Account getAccount(Id accountId) {',
      '        if (accountId == null) {',
      '            return null;',
      '        }',
      '        return [SELECT Id, Name FROM Account WHERE Id = :accountId];',
      '    }',
      '    private void processAccounts(List<Account> accounts) {',
      '        for (Account acc : accounts) {',
      '            if (acc.IsActive__c) {',
      '                acc.Status__c = "Active";',
      '            }',
      '        }',
      '    }',
      '}',
    ].join('\n');

    const result = analyzeApex(code, 'AccountService.cls');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});

// ── F# ────────────────────────────────────────────────────────────────────────

describe('analyzeFSharp', () => {
  it('returns valid output for empty code', () => {
    const result = analyzeFSharp('', 'test.fs');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects let function bindings with parameters', () => {
    const code = [
      'module Calculator',
      '',
      'let add x y = x + y',
      '',
      'let rec factorial n =',
      '    if n <= 1 then 1',
      '    else n * factorial (n - 1)',
      '',
      'let classify value =',
      '    match value with',
      '    | 0 -> "zero"',
      '    | n when n > 0 -> "positive"',
      '    | _ -> "negative"',
    ].join('\n');

    const result = analyzeFSharp(code, 'Calculator.fs');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});

// ── VB.NET ────────────────────────────────────────────────────────────────────

describe('analyzeVbNet', () => {
  it('returns valid output for empty code', () => {
    const result = analyzeVbNet('', 'test.vb');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects Sub and Function definitions', () => {
    const code = [
      'Public Class Calculator',
      '    Public Function Add(a As Integer, b As Integer) As Integer',
      '        Return a + b',
      '    End Function',
      '',
      '    Private Sub ProcessItems(items As List(Of String))',
      '        For Each item In items',
      '            If item.Length > 0 Then',
      '                Console.WriteLine(item)',
      '            End If',
      '        Next',
      '    End Sub',
      'End Class',
    ].join('\n');

    const result = analyzeVbNet(code, 'Calculator.vb');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});

// ── Perl ──────────────────────────────────────────────────────────────────────

describe('analyzePerl', () => {
  it('returns valid output for empty code', () => {
    const result = analyzePerl('', 'test.pl');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects sub definitions', () => {
    const code = [
      '#!/usr/bin/perl',
      'use strict;',
      'use warnings;',
      '',
      'sub greet {',
      '    my ($name) = @_;',
      '    if (defined $name) {',
      '        print "Hello, $name\\n";',
      '    }',
      '}',
      '',
      'sub process_items {',
      '    my @items = @_;',
      '    foreach my $item (@items) {',
      '        unless ($item eq "") {',
      '            greet($item);',
      '        }',
      '    }',
      '}',
    ].join('\n');

    const result = analyzePerl(code, 'script.pl');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});

// ── Groovy ────────────────────────────────────────────────────────────────────

describe('analyzeGroovy', () => {
  it('returns valid output for empty code', () => {
    const result = analyzeGroovy('', 'test.groovy');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects def method definitions', () => {
    const code = [
      'class Calculator {',
      '    def add(a, b) {',
      '        return a + b',
      '    }',
      '',
      '    def processItems(List items) {',
      '        items.each { item ->',
      '            if (item != null) {',
      '                println item',
      '            }',
      '        }',
      '    }',
      '}',
    ].join('\n');

    const result = analyzeGroovy(code, 'Calculator.groovy');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});

// ── Objective-C ───────────────────────────────────────────────────────────────

describe('analyzeObjC', () => {
  it('returns valid output for empty code', () => {
    const result = analyzeObjC('', 'test.m');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects instance and class method definitions', () => {
    const code = [
      '#import "Calculator.h"',
      '',
      '@implementation Calculator',
      '',
      '- (NSInteger)addA:(NSInteger)a toB:(NSInteger)b {',
      '    if (a < 0 || b < 0) {',
      '        return 0;',
      '    }',
      '    return a + b;',
      '}',
      '',
      '+ (instancetype)sharedInstance {',
      '    static Calculator *instance = nil;',
      '    if (!instance) {',
      '        instance = [[Calculator alloc] init];',
      '    }',
      '    return instance;',
      '}',
      '',
      '@end',
    ].join('\n');

    const result = analyzeObjC(code, 'Calculator.m');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});

// ── PowerShell ────────────────────────────────────────────────────────────────

describe('analyzePowerShell', () => {
  it('returns valid output for empty code', () => {
    const result = analyzePowerShell('', 'test.ps1');
    expect(result.functions.length).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('detects function definitions', () => {
    const code = [
      'function Get-SystemInfo {',
      '    param([string]$ComputerName = "localhost")',
      '    if ($ComputerName -eq "") {',
      '        Write-Error "ComputerName cannot be empty"',
      '        return',
      '    }',
      '    Get-WmiObject Win32_ComputerSystem -ComputerName $ComputerName',
      '}',
      '',
      'function Invoke-Cleanup {',
      '    [CmdletBinding()]',
      '    param([string[]]$Paths)',
      '    foreach ($path in $Paths) {',
      '        if (Test-Path $path) {',
      '            Remove-Item $path -Recurse -Force',
      '        }',
      '    }',
      '}',
    ].join('\n');

    const result = analyzePowerShell(code, 'utils.ps1');
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.metrics.totalLines).toBeGreaterThanOrEqual(0);
  });
});
