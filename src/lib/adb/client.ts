// src/lib/adb/client.ts
// Thin wrapper around the `adb` binary via child_process.spawn.
// Auth decisions are made at the route layer — this module is auth-agnostic.

import { spawn } from 'node:child_process';

export interface AdbResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface AdbDevice {
  serial: string; // e.g. "10.0.0.144:5555"
  state: 'device' | 'unauthorized' | 'offline' | 'no device';
}

// Only allow safe target strings: IP:port or serial-style identifiers.
const TARGET_RE = /^[a-zA-Z0-9.:-]+$/;
// Require IP:port or plain serial (no path traversal, no shell metacharacters).
const IP_PORT_RE = /^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$|^[a-zA-Z0-9._-]+$/;

function validateTarget(target: string): void {
  if (!TARGET_RE.test(target) || !IP_PORT_RE.test(target)) {
    throw new Error(`Invalid adb target: ${target}`);
  }
}

function validateShellCmd(cmd: string): void {
  // Allow the full range of characters needed for run-as / am commands,
  // but reject null bytes and newlines.
  if (/[\0\n\r]/.test(cmd)) {
    throw new Error('adb shell command contains invalid characters');
  }
}

function run(args: string[], timeoutMs = 30_000): Promise<AdbResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('adb', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    console.log('[adb]', 'adb', args.join(' '));

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`adb timed out after ${timeoutMs}ms: adb ${args.join(' ')}`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const result: AdbResult = { stdout, stderr, code: code ?? 1 };
      console.log('[adb] exit', code, '| stdout:', stdout.trim().slice(0, 200));
      resolve(result);
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function adbConnect(target: string): Promise<AdbResult> {
  validateTarget(target);
  return run(['connect', target]);
}

export async function adbDisconnect(target: string): Promise<AdbResult> {
  validateTarget(target);
  return run(['disconnect', target]);
}

export async function adbDevices(): Promise<AdbDevice[]> {
  const result = await run(['devices']);
  const lines = result.stdout.split('\n').slice(1); // skip "List of devices attached"
  const devices: AdbDevice[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const serial = parts[0];
      const rawState = parts[1];
      let state: AdbDevice['state'] = 'offline';
      if (rawState === 'device') state = 'device';
      else if (rawState === 'unauthorized') state = 'unauthorized';
      else if (rawState === 'offline') state = 'offline';
      else if (rawState === 'no') state = 'no device';
      devices.push({ serial, state });
    }
  }
  return devices;
}

export async function adbInstall(target: string, apkPath: string): Promise<AdbResult> {
  validateTarget(target);
  // APK install can be slow on FireStick hardware — 120s timeout.
  return run(['-s', target, 'install', '-r', apkPath], 120_000);
}

export async function adbShell(target: string, cmd: string): Promise<AdbResult> {
  validateTarget(target);
  validateShellCmd(cmd);
  // adb shell passes cmd as a single token to the device shell — no local shell expansion.
  return run(['-s', target, 'shell', cmd]);
}

export async function adbPush(
  target: string,
  localPath: string,
  remotePath: string,
): Promise<AdbResult> {
  validateTarget(target);
  return run(['-s', target, 'push', localPath, remotePath]);
}
