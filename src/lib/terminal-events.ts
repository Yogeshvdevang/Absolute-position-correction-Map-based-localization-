export type TerminalLogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  level: TerminalLogLevel;
  source: string;
  message: string;
}

const MAX_TERMINAL_EVENTS = 600;
const terminalEvents: TerminalLogEntry[] = [];
const listeners = new Set<() => void>();
let bridgeInstalled = false;

const notify = () => {
  listeners.forEach((listener) => listener());
};

const stringifyArg = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const pushTerminalEvent = (
  level: TerminalLogLevel,
  message: string,
  source = 'app',
  timestamp = new Date().toISOString()
) => {
  terminalEvents.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    level,
    source,
    message,
  });

  if (terminalEvents.length > MAX_TERMINAL_EVENTS) {
    terminalEvents.splice(0, terminalEvents.length - MAX_TERMINAL_EVENTS);
  }
  notify();
};

export const getTerminalEvents = () => [...terminalEvents];

export const clearTerminalEvents = () => {
  terminalEvents.length = 0;
  notify();
};

export const subscribeTerminalEvents = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const installTerminalEventBridge = () => {
  if (bridgeInstalled || typeof window === 'undefined') return;
  bridgeInstalled = true;

  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const wrapConsole =
    (level: TerminalLogLevel, source: string, originalFn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      originalFn(...args);
      const message = args.map((arg) => stringifyArg(arg)).join(' ');
      pushTerminalEvent(level, message, source);
    };

  console.log = wrapConsole('info', 'console', originalConsole.log);
  console.info = wrapConsole('info', 'console', originalConsole.info);
  console.warn = wrapConsole('warn', 'console', originalConsole.warn);
  console.error = wrapConsole('error', 'console', originalConsole.error);
  console.debug = wrapConsole('debug', 'console', originalConsole.debug);

  window.addEventListener('error', (event) => {
    const location = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'unknown';
    pushTerminalEvent('error', `${event.message} (${location})`, 'window');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = stringifyArg(event.reason);
    pushTerminalEvent('error', `Unhandled promise rejection: ${reason}`, 'promise');
  });

  pushTerminalEvent('info', 'Terminal event bridge initialized', 'system');
};

