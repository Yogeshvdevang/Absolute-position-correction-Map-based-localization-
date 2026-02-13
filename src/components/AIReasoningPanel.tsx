import { Brain, Sparkles, TrendingUp, AlertCircle } from 'lucide-react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Card } from './ui/card';

interface AISummary {
  summary_id: string;
  content: string;
  source_entities: string[];
  confidence: number;
  timestamp: string;
  type: 'info' | 'warning' | 'insight';
}

const mockSummaries: AISummary[] = [
  {
    summary_id: 'SUM-001',
    content: 'Two unmanned ground vehicles patrolling east ridge; no anomalies detected.',
    source_entities: ['UGV-001', 'UGV-002'],
    confidence: 0.93,
    timestamp: new Date().toISOString(),
    type: 'info'
  },
  {
    summary_id: 'SUM-002',
    content: 'UAV-002 trajectory suggests optimal surveillance pattern. Mission efficiency +15%.',
    source_entities: ['UAV-002'],
    confidence: 0.87,
    timestamp: new Date(Date.now() - 300000).toISOString(),
    type: 'insight'
  },
  {
    summary_id: 'SUM-003',
    content: 'Weather conditions changing in sector Alpha. Recommend altitude adjustment for UAV-003.',
    source_entities: ['UAV-003'],
    confidence: 0.91,
    timestamp: new Date(Date.now() - 600000).toISOString(),
    type: 'warning'
  }
];

export const AIReasoningPanel = () => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'warning':
        return 'bg-orange-highlight text-background';
      case 'insight':
        return 'bg-blue-highlight text-background';
      default:
        return 'bg-green-highlight text-background';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertCircle className="h-3 w-3" />;
      case 'insight':
        return <TrendingUp className="h-3 w-3" />;
      default:
        return <Sparkles className="h-3 w-3" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="p-3 border-b border-panel-border">
        <div className="flex items-center gap-2 mb-2">
          <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <path d="m8 2 .5 1.5L10 4l-1.5.5L8 6l-.5-1.5L6 4l1.5-.5Z" />
            <path d="m20 8 .5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L18 10l1.5-.5Z" />
            <path d="m3 12 .5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5Z" />
          </svg>
          <h2 className="text-sm font-semibold text-foreground">AI Reasoning Feed</h2>
          <Badge className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 ml-auto">
            ACTIVE
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Real-time AI-generated situational summaries
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {mockSummaries.map((summary) => (
            <Card key={summary.summary_id} className="p-3 border-panel-border bg-secondary/50">
              <div className="flex items-start gap-2 mb-2">
                <Badge className={`${getTypeColor(summary.type)} text-[10px] px-2 py-0.5 flex items-center gap-1`}>
                  {getTypeIcon(summary.type)}
                  {summary.type.toUpperCase()}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(summary.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <p className="text-sm text-foreground mb-2">{summary.content}</p>
              
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Sources:</span>
                  <div className="flex gap-1">
                    {summary.source_entities.map((entity) => (
                      <Badge key={entity} variant="outline" className="text-[10px] px-1 py-0">
                        {entity}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Confidence:</span>
                  <span className="text-foreground font-medium">
                    {(summary.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
