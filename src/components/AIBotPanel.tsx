import { useState } from 'react';
import { Bot, Send, Sparkles, TrendingUp, Shield, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const initialMessages: Message[] = [
  {
    id: 1,
    role: 'assistant',
    content: 'AI Mission Assistant online. I can help with tactical analysis, threat assessment, and strategic recommendations. How can I assist you?',
    timestamp: '06:00',
  },
];

const quickActions = [
  { icon: TrendingUp, label: 'Analyze Threats', prompt: 'Analyze current threat levels in all sectors' },
  { icon: Shield, label: 'Asset Status', prompt: 'Provide status report on all active assets' },
  { icon: AlertCircle, label: 'Risk Assessment', prompt: 'Assess mission risk factors and recommend mitigations' },
];

export const AIBotPanel = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: messages.length + 2,
        role: 'assistant',
        content: 'Based on current intelligence, I recommend prioritizing surveillance in Grid 46N due to increased hostile activity. All assets show nominal status with 92% operational readiness.',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">AI Mission Assistant</h2>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
          </div>
          <Badge variant="default" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            AI
          </Badge>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Quick Actions:</p>
          <div className="flex flex-col gap-1.5">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={() => handleQuickAction(action.prompt)}
                >
                  <Icon className="h-3 w-3 mr-2" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'assistant'
                    ? 'bg-primary/10'
                    : 'bg-secondary'
                }`}
              >
                {message.role === 'assistant' ? (
                  <Bot className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <span className="text-xs font-semibold">U</span>
                )}
              </div>
              <div className={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`}>
                <div
                  className={`inline-block p-2.5 rounded-lg text-xs ${
                    message.role === 'assistant'
                      ? 'bg-secondary/50 border border-border/50'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {message.content}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{message.timestamp}</p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-secondary/50 border border-border/50 p-2.5 rounded-lg">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask AI assistant..."
            className="bg-secondary border-border text-xs h-8"
          />
          <Button size="sm" className="h-8" onClick={handleSend}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
