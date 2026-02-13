import { Terminal, ChevronRight, Copy, Trash2, Plus, X, SplitSquareVertical } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { useState, useRef, useEffect, useCallback } from 'react';

interface CommandEntry {
  id: number;
  input: string;
  output: string;
  timestamp: string;
  type: 'success' | 'error' | 'info';
}

interface TerminalInstance {
  id: string;
  name: string;
  history: CommandEntry[];
}

const availableCommands = [
  'sys status --all',
  'sys status --brief',
  'sys restart',
  'asset list --active',
  'asset list --all',
  'asset info',
  'asset deploy',
  'net ping --target',
  'net scan',
  'net status',
  'sensor scan --sector',
  'sensor calibrate',
  'mission start',
  'mission abort',
  'mission status',
  'help',
  'clear',
  'exit',
];

const initialHistory: CommandEntry[] = [
  { id: 1, input: 'sys status --all', output: 'All systems operational. Uptime: 47d 12h 34m', timestamp: '06:00:12', type: 'success' },
  { id: 2, input: 'asset list --active', output: '12 assets online | 3 standby | 1 maintenance', timestamp: '05:58:45', type: 'info' },
  { id: 3, input: 'net ping --target alpha-node', output: 'Response: 23ms | Packet loss: 0%', timestamp: '05:55:21', type: 'success' },
  { id: 4, input: 'sensor scan --sector 7', output: 'ERROR: Sector 7 access restricted', timestamp: '05:52:03', type: 'error' },
];

export const IntelligencePanel = () => {
  const [terminals, setTerminals] = useState<TerminalInstance[]>([
    { id: 'term-1', name: 'CHAOX SHELL', history: initialHistory }
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState('term-1');
  const [currentInput, setCurrentInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeTerminal = terminals.find(t => t.id === activeTerminalId) || terminals[0];
  const commandHistory = activeTerminal?.history.map(h => h.input) || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeTerminal?.history]);

  useEffect(() => {
    if (currentInput.trim()) {
      const matches = availableCommands.filter(cmd => 
        cmd.toLowerCase().startsWith(currentInput.toLowerCase())
      );
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setSelectedSuggestion(0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [currentInput]);

  const executeCommand = useCallback((command: string) => {
    let output = `Executing: ${command}...`;
    let type: 'success' | 'error' | 'info' = 'info';

    // Simulated command responses
    if (command === 'help') {
      output = 'Available commands: sys, asset, net, sensor, mission, help, clear, exit';
      type = 'info';
    } else if (command === 'clear') {
      setTerminals(prev => prev.map(t => 
        t.id === activeTerminalId ? { ...t, history: [] } : t
      ));
      return;
    } else if (command.startsWith('sys status')) {
      output = 'All systems operational. CPU: 23% | MEM: 67% | NET: Active';
      type = 'success';
    } else if (command.startsWith('asset')) {
      output = '16 assets registered | 12 online | 3 standby | 1 offline';
      type = 'success';
    } else if (command.startsWith('net ping')) {
      output = 'Ping successful. Latency: 18ms | Jitter: 2ms';
      type = 'success';
    } else if (command.startsWith('sensor')) {
      if (command.includes('sector 7')) {
        output = 'ERROR: Access denied. Sector 7 requires elevated permissions.';
        type = 'error';
      } else {
        output = 'Sensor sweep complete. No anomalies detected.';
        type = 'success';
      }
    } else if (command.startsWith('mission')) {
      output = 'Mission Alpha-7 in progress. ETA: 2h 34m';
      type = 'info';
    }

    const newEntry: CommandEntry = {
      id: Date.now(),
      input: command,
      output,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      type,
    };

    setTerminals(prev => prev.map(t => 
      t.id === activeTerminalId ? { ...t, history: [...t.history, newEntry] } : t
    ));
  }, [activeTerminalId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentInput.trim()) return;

    executeCommand(currentInput.trim());
    setCurrentInput('');
    setHistoryIndex(-1);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (e.key === 'Tab') {
          e.preventDefault();
          setCurrentInput(suggestions[selectedSuggestion]);
          setShowSuggestions(false);
          return;
        }
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }

    // History navigation when no suggestions
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length > 0) {
          const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
          setHistoryIndex(newIndex);
          setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex] || '');
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setCurrentInput('');
        }
      }
    }
  };

  const addTerminal = () => {
    const newId = `term-${Date.now()}`;
    const termCount = terminals.length + 1;
    setTerminals(prev => [...prev, { 
      id: newId, 
      name: `SHELL ${termCount}`, 
      history: [] 
    }]);
    setActiveTerminalId(newId);
  };

  const splitTerminal = () => {
    // Duplicate current terminal with same history
    const newId = `term-${Date.now()}`;
    const termCount = terminals.length + 1;
    setTerminals(prev => [...prev, { 
      id: newId, 
      name: `SHELL ${termCount}`, 
      history: [...(activeTerminal?.history || [])]
    }]);
    setActiveTerminalId(newId);
  };

  const closeTerminal = (id: string) => {
    if (terminals.length === 1) return;
    setTerminals(prev => prev.filter(t => t.id !== id));
    if (activeTerminalId === id) {
      setActiveTerminalId(terminals[0].id === id ? terminals[1]?.id : terminals[0].id);
    }
  };

  const clearHistory = () => {
    setTerminals(prev => prev.map(t => 
      t.id === activeTerminalId ? { ...t, history: [] } : t
    ));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="h-full flex flex-col bg-black/40">
      {/* Terminal Tabs */}
      <div className="flex items-center border-b border-primary/20 bg-black/20">
        <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
          {terminals.map((term) => (
            <div
              key={term.id}
              className={`group flex items-center gap-1 px-3 py-1.5 text-xs font-mono cursor-pointer border-r border-primary/10 ${
                term.id === activeTerminalId 
                  ? 'bg-black/40 text-primary' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-black/20'
              }`}
              onClick={() => setActiveTerminalId(term.id)}
            >
              <Terminal className="h-3 w-3" />
              <span>{term.name}</span>
              {terminals.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 ml-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(term.id);
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 border-l border-primary/10">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addTerminal} title="New Terminal">
            <Plus className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={splitTerminal} title="Split Terminal">
            <SplitSquareVertical className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={clearHistory} title="Clear">
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Terminal Content */}
      <ScrollArea className="flex-1 font-mono text-xs" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {activeTerminal?.history.map((entry) => (
            <div key={entry.id} className="group">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-[10px] opacity-50">[{entry.timestamp}]</span>
                <ChevronRight className="h-3 w-3 text-primary" />
                <span className="text-foreground">{entry.input}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyToClipboard(entry.input)}
                >
                  <Copy className="h-2.5 w-2.5" />
                </Button>
              </div>
              <div className={`ml-5 mt-1 pl-2 border-l ${
                entry.type === 'error' ? 'border-destructive/50 text-destructive' :
                entry.type === 'success' ? 'border-primary/50 text-primary' :
                'border-muted-foreground/30 text-muted-foreground'
              }`}>
                {entry.output}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Command Input with Autocomplete */}
      <div className="relative">
        {/* Autocomplete Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mx-3 mb-1 bg-black/90 border border-primary/30 rounded overflow-hidden z-50">
            {suggestions.slice(0, 6).map((suggestion, idx) => (
              <div
                key={suggestion}
                className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                  idx === selectedSuggestion 
                    ? 'bg-primary/20 text-primary' 
                    : 'text-muted-foreground hover:bg-primary/10'
                }`}
                onClick={() => {
                  setCurrentInput(suggestion);
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
              >
                <ChevronRight className="h-3 w-3 inline mr-2 text-primary/50" />
                {suggestion}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-3 border-t border-primary/20">
          <div className="flex items-center gap-2 bg-black/60 rounded px-2 py-1.5 border border-primary/20 focus-within:border-primary/50">
            <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => {
                setCurrentInput(e.target.value);
                setHistoryIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter command... (↑↓ history, Tab autocomplete)"
              className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
        </form>
      </div>
    </div>
  );
};
