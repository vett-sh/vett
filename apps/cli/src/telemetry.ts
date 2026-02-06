import { platform, arch } from 'node:os';
import { isTelemetryEnabled, getDeviceId, loadConfig } from './config';

declare const __VERSION__: string;

interface TelemetryEvent {
  type: 'cli_command' | 'cli_error';
  device_id: string;
  cli_version: string;
  os_platform: string;
  os_arch: string;
  node_version: string;
  [key: string]: unknown;
}

function sendEvents(events: TelemetryEvent[]): void {
  const config = loadConfig();
  const url = `${config.registryUrl}/api/v1/telemetry`;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

function baseContext(): Pick<
  TelemetryEvent,
  'device_id' | 'cli_version' | 'os_platform' | 'os_arch' | 'node_version'
> {
  return {
    device_id: getDeviceId(),
    cli_version: __VERSION__,
    os_platform: platform(),
    os_arch: arch(),
    node_version: process.version,
  };
}

export function trackCommand({
  command,
  duration_ms,
  success,
}: {
  command: string;
  duration_ms: number;
  success: boolean;
}): void {
  if (!isTelemetryEnabled()) return;

  sendEvents([
    {
      type: 'cli_command',
      ...baseContext(),
      command,
      duration_ms: Math.round(duration_ms),
      success,
    },
  ]);
}

export function trackError({ command, error }: { command: string; error: unknown }): void {
  if (!isTelemetryEnabled()) return;

  const errorObj = error instanceof Error ? error : new Error(String(error));

  sendEvents([
    {
      type: 'cli_error',
      ...baseContext(),
      command,
      error_type: errorObj.name,
      error_message: errorObj.message.slice(0, 512),
    },
  ]);
}
