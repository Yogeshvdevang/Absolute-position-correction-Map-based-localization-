import { FileSearch, Download, Filter, Calendar, TrendingUp } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Input } from './ui/input';

const reports = [
  {
    id: 'RPT-2024-001',
    title: 'Threat Assessment - Northern Sector',
    date: '2024-01-15',
    category: 'Threat Analysis',
    classification: 'Secret',
    status: 'Current',
    summary: 'Increased hostile activity detected in grid sectors 45-48N. Recommend enhanced surveillance.',
  },
  {
    id: 'RPT-2024-002',
    title: 'Asset Performance Review Q1',
    date: '2024-01-12',
    category: 'Operations',
    classification: 'Confidential',
    status: 'Current',
    summary: 'Overall asset readiness at 92%. All units operational with minor maintenance requirements.',
  },
  {
    id: 'RPT-2024-003',
    title: 'Enemy Movement Pattern Analysis',
    date: '2024-01-10',
    category: 'Intelligence',
    classification: 'Secret',
    status: 'Archived',
    summary: 'Identified 3 primary movement corridors used by hostile forces. Pattern suggests coordinated activity.',
  },
];

export const IntelligenceReportPanel = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-panel-border">
        <h2 className="text-sm font-semibold text-foreground mb-3">Intelligence Reports</h2>
        
        <div className="space-y-2">
          <div className="relative">
            <FileSearch className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              className="pl-8 bg-secondary border-border text-xs h-8"
            />
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs h-7">
              <Filter className="h-3 w-3 mr-1" />
              Filter
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs h-7">
              <Calendar className="h-3 w-3 mr-1" />
              Date
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="p-3 rounded bg-secondary/50 border border-border/50 hover:bg-secondary cursor-pointer">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-foreground">{report.id}</span>
                    <Badge 
                      variant={report.classification === 'Secret' ? 'destructive' : 'secondary'} 
                      className="text-[10px] h-4"
                    >
                      {report.classification}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{report.title}</h3>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mb-2">{report.summary}</p>

              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px] h-4">{report.category}</Badge>
                  <Badge variant={report.status === 'Current' ? 'default' : 'secondary'} className="text-[10px] h-4">
                    {report.status}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{report.date}</span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-panel-border">
        <div className="flex items-center gap-2 mb-2 text-xs">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">
            <span className="text-foreground font-medium">{reports.length}</span> Active Reports
          </span>
        </div>
        <Button variant="outline" className="w-full" size="sm">
          <FileSearch className="h-3.5 w-3.5 mr-2" />
          Generate New Report
        </Button>
      </div>
    </div>
  );
};
