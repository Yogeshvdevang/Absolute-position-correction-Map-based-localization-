import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, TerminalSquare, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  clearTerminalEvents,
  getTerminalEvents,
  subscribeTerminalEvents,
  type TerminalLogEntry,
  type TerminalLogLevel,
} from '@/lib/terminal-events';

type TerminalFilter = 'all' | TerminalLogLevel;

const levelStyles: Record<TerminalLogLevel, string> = {
  info: 'text-cyan-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
  debug: 'text-slate-300',
};

export const TerminalPanel = () => {
  const [events, setEvents] = useState<TerminalLogEntry[]>(() => getTerminalEvents());
  const [filter, setFilter] = useState<TerminalFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return subscribeTerminalEvents(() => {
      setEvents(getTerminalEvents());
    });
  }, []);

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((event) => event.level === filter);
  }, [events, filter]);

  useEffect(() => {
    if (!autoScroll) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [visibleEvents, autoScroll]);

  return (
    <div className="h-full flex flex-col bg-panel border-r border-panel-border">
      <div className="border-b border-panel-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4 text-cyan-300" />
            <div className="text-sm font-semibold text-foreground">Terminal Panel</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              clearTerminalEvents();
              setEvents([]);
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {(['all', 'info', 'warn', 'error'] as TerminalFilter[]).map((level) => (
            <Button
              key={level}
              variant={filter === level ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setFilter(level)}
            >
              {level.toUpperCase()}
            </Button>
          ))}
          <Button
            variant={autoScroll ? 'default' : 'ghost'}
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => setAutoScroll((prev) => !prev)}
          >
            Auto
          </Button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="docs-scroll flex-1 overflow-y-auto"
      >
        <div className="space-y-1 p-3 font-mono text-[11px]">
          {visibleEvents.length === 0 ? (
            <div className="rounded border border-panel-border bg-black/20 p-2 text-muted-foreground">
              No terminal events yet.
            </div>
          ) : (
            visibleEvents.map((event) => (
              <div key={event.id} className="rounded border border-panel-border bg-black/20 px-2 py-1.5">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={levelStyles[event.level]}>
                    [{event.level.toUpperCase()}]
                  </span>
                  <span className="text-slate-400">[{event.source}]</span>
                  {event.level === 'error' ? (
                    <AlertTriangle className="ml-auto h-3 w-3 text-red-300" />
                  ) : event.level === 'info' ? (
                    <Info className="ml-auto h-3 w-3 text-cyan-300" />
                  ) : null}
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-slate-200">{event.message}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
