import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Boxes,
  CirclePlay,
  Database,
  Eye,
  GitBranch,
  Globe,
  Home,
  Image as ImageIcon,
  Layers3,
  Map,
  Radar,
  Search,
  Server,
  Settings,
  Shield,
  SlidersHorizontal,
  Target,
  Video,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import logo from '@/assets/logo.png';

interface DocumentationPageContentProps {
  onBack?: () => void;
  onClose?: () => void;
  topPage?: DocsTopPage;
  onTopPageChange?: (page: DocsTopPage) => void;
}

export type DocsTopPage = 'guides' | 'reference' | 'samples' | 'license' | 'changelog';

const docsTopTabs: { key: DocsTopPage; label: string }[] = [
  { key: 'guides', label: 'Guides' },
  { key: 'reference', label: 'Reference' },
  { key: 'samples', label: 'Samples' },
  { key: 'license', label: 'License' },
  { key: 'changelog', label: 'Changelog' },
];

const guidesNavGroups = [
  {
    title: 'Concepts',
    icon: BookOpen,
    items: [
      { label: 'Overview', href: '#platform-overview' },
      { label: 'Workspace Layout', href: '#workspace-layout' },
      { label: 'Settings And Docs', href: '#settings-and-docs' },
    ],
  },
  {
    title: 'Getting Started',
    icon: CirclePlay,
    items: [
      { label: 'Run And Configure', href: '#run-and-configure' },
      { label: 'Backend Services', href: '#backend-services' },
    ],
  },
  {
    title: 'Platform',
    icon: Layers3,
    items: [
      { label: 'Operations Panels', href: '#operations-panels' },
      { label: 'Visual Navigation', href: '#visual-navigation' },
      { label: 'Fallback Path', href: '#fallback-path' },
    ],
  },
];

const guidesPageSections = [
  { label: 'Platform Overview', href: '#platform-overview' },
  { label: 'Workspace Layout', href: '#workspace-layout' },
  { label: 'Operations Panels', href: '#operations-panels' },
  { label: 'Visual Navigation', href: '#visual-navigation' },
  { label: 'Backend Services', href: '#backend-services' },
  { label: 'Run And Configure', href: '#run-and-configure' },
  { label: 'Settings And Docs', href: '#settings-and-docs' },
  { label: 'Fallback Path', href: '#fallback-path' },
];

const articleCards = [
  {
    icon: Boxes,
    title: 'Mission Workspace',
    version: 'v2.1.0',
    body: 'Map canvas, left operations panels, detail views, right-side tools, top status controls, and embedded documentation.',
  },
  {
    icon: Server,
    title: 'Backend API',
    version: 'v2.1.0',
    body: 'FastAPI services for telemetry, commands, APC frame ingestion, offline map tiles, and benchmark workflows.',
  },
  {
    icon: Zap,
    title: 'APC Runtime',
    version: 'v1.5.0',
    body: 'Coarse matching, EKF fusion, and optional in-process visual localization for drift correction in denied-GNSS operation.',
  },
];

const featureCards = [
  {
    icon: Boxes,
    title: 'Operations Workspace',
    body: 'A control center UI for assets, map operations, mission planning, live status, notifications, and documentation.',
    badge: 'Frontend',
  },
  {
    icon: Radar,
    title: 'Absolute Position Correction',
    body: 'GNSS-denied visual navigation that aligns live imagery to map data and returns corrected coordinates with confidence.',
    badge: 'Navigation',
  },
  {
    icon: Zap,
    title: 'Training And Benchmarking',
    body: 'Scaffolded training and benchmark pipelines for APC evolution, validation, and future matcher integrations.',
    badge: 'ML Ops',
  },
];

const visualFlowCards = [
  {
    icon: Database,
    title: 'Map DB Preparation',
    body: 'Offline satellite tiles are exported into a visual-localization database folder and activated as the current map_db_path.',
    badge: 'Stage 1',
  },
  {
    icon: GitBranch,
    title: 'Backend Selection',
    body: 'The APC panel selects visual_localization and saves the provider configuration before localization starts.',
    badge: 'Stage 2',
  },
  {
    icon: Target,
    title: 'Approximate Pose Seed',
    body: 'The system still requires rough latitude, longitude, and heading from manual entry, telemetry, or previous initialization.',
    badge: 'Stage 3',
  },
  {
    icon: Video,
    title: 'Frame Submission',
    body: 'The latest camera frame and pose metadata are sent to /apc/frame to enter the backend APC pipeline.',
    badge: 'Stage 4',
  },
  {
    icon: Radar,
    title: 'Visual Match Runtime',
    body: 'The vendored service loads the DB, describes imagery with SuperPoint, and matches the query frame with SuperGlue.',
    badge: 'Stage 5',
  },
  {
    icon: GitBranch,
    title: 'EKF Fusion Output',
    body: 'The predicted coordinate is fused through the EKF and returned to the interface as the visual_localization result.',
    badge: 'Stage 6',
  },
];

interface GenericDocCard {
  title: string;
  body: string;
  icon: LucideIcon;
  badge?: string;
}

interface GenericDocSection {
  id: string;
  title: string;
  description: string;
  cards: GenericDocCard[];
}

interface GenericDocsPage {
  pill: string;
  title: string;
  description: string;
  navGroups: {
    title: string;
    icon: LucideIcon;
    items: { label: string; href: string }[];
  }[];
  sections: GenericDocSection[];
}

const docsPages: Record<Exclude<DocsTopPage, 'guides'>, GenericDocsPage> = {
  reference: {
    pill: 'Developer Reference',
    title: 'Reference',
    description:
      'Authoritative technical reference for frontend modules, backend APIs, APC runtime interfaces, and operational data contracts.',
    navGroups: [
      {
        title: 'APIs',
        icon: Server,
        items: [
          { label: 'API Surface', href: '#api-surface' },
          { label: 'Data Models', href: '#data-models' },
          { label: 'Runtime Interfaces', href: '#runtime-interfaces' },
        ],
      },
      {
        title: 'Application',
        icon: Layers3,
        items: [
          { label: 'UI Components', href: '#ui-components' },
          { label: 'File And Paths', href: '#file-and-paths' },
        ],
      },
    ],
    sections: [
      {
        id: 'api-surface',
        title: 'API Surface',
        description:
          'Core service endpoints are grouped by telemetry, APC processing, map operations, and benchmark tooling.',
        cards: [
          { title: 'Health And System', body: 'Liveness and readiness checks for service orchestration and operator diagnostics.', icon: Shield },
          { title: 'Telemetry + Commands', body: 'Entity updates, control commands, and runtime state transitions.', icon: Wifi },
          { title: 'APC Endpoints', body: 'Provider config, frame submission, and corrected position output endpoints.', icon: Radar },
          { title: 'Map Endpoints', body: 'Tile export, DB activation, cache operations, and raster metadata access.', icon: Database },
        ],
      },
      {
        id: 'data-models',
        title: 'Data Models',
        description:
          'Shared models keep frontend and backend structures aligned for assets, tracks, and APC payloads.',
        cards: [
          { title: 'Entity Model', body: 'Platform identity, position, heading, status, and mission metadata fields.', icon: Boxes },
          { title: 'Track Model', body: 'Disposition, confidence, sensors, source details, and tasking metadata.', icon: Target },
          { title: 'APC Payload', body: 'Frame data, pose seed, timestamps, provider selection, and confidence output.', icon: ImageIcon },
          { title: 'Map Metadata', body: 'Zoom levels, bounds, tile counts, and active visual DB references.', icon: Map },
        ],
      },
      {
        id: 'ui-components',
        title: 'UI Components',
        description:
          'Primary operator workflows are composed from reusable panel and detail components.',
        cards: [
          { title: 'Workspace Shell', body: 'Vertical app bar, central map, side tool panels, and detail panes.', icon: Layers3 },
          { title: 'Operations Panels', body: 'Assets, map module, training, targeting, and offline map controls.', icon: SlidersHorizontal },
          { title: 'Settings + Docs', body: 'Settings dialog and full documentation workspace integration.', icon: Settings },
          { title: 'Status Tooling', body: 'Notifications, connectivity indicators, and mission runtime context.', icon: Eye },
        ],
      },
      {
        id: 'runtime-interfaces',
        title: 'Runtime Interfaces',
        description:
          'The APC runtime accepts seeded pose + imagery and returns fused coordinates with fallback safety logic.',
        cards: [
          { title: 'Frame Ingestion', body: 'REST/websocket ingestion pipeline with preprocessing and coarse match stage.', icon: Video },
          { title: 'Visual Localization', body: 'Optional vendored matcher pipeline based on SuperPoint/SuperGlue.', icon: Radar },
          { title: 'Fusion Layer', body: 'EKF output stabilization and return payload normalization.', icon: GitBranch },
          { title: 'Fallback Mode', body: 'Automatic fallback to native path when provider checks fail.', icon: Shield },
        ],
      },
      {
        id: 'file-and-paths',
        title: 'File And Paths',
        description:
          'Operational paths cover offline map storage, visual DB exports, model assets, and backend app modules.',
        cards: [
          { title: 'Frontend Source', body: 'React pages, panels, hooks, and UI primitives under src/.', icon: Home },
          { title: 'Backend Source', body: 'FastAPI routes, compute modules, APC runtime, and map services under app/backend/.', icon: Server },
          { title: 'Map DB Storage', body: 'Visual localization DB tiles exported under app/visual-map-dbs/.', icon: Database },
          { title: 'Public Assets', body: 'Static icons, logos, and 3D models served from public/.', icon: Globe },
        ],
      },
    ],
  },
  samples: {
    pill: 'Working Examples',
    title: 'Samples',
    description:
      'Task-oriented examples that show how operators run APC, prepare offline maps, and validate output quality.',
    navGroups: [
      {
        title: 'Scenarios',
        icon: CirclePlay,
        items: [
          { label: 'Quick Start', href: '#quick-start' },
          { label: 'APC Flow Sample', href: '#apc-flow-sample' },
          { label: 'Offline Maps Sample', href: '#offline-maps-sample' },
        ],
      },
      {
        title: 'Validation',
        icon: Target,
        items: [
          { label: 'Training Sample', href: '#training-sample' },
          { label: 'Troubleshooting', href: '#troubleshooting' },
        ],
      },
    ],
    sections: [
      {
        id: 'quick-start',
        title: 'Quick Start',
        description:
          'Fast baseline workflow to bring up the app, select a panel, and verify backend connectivity.',
        cards: [
          { title: 'Launch UI', body: 'Start frontend and open the mission workspace.', icon: Home, badge: 'Step 1' },
          { title: 'Check Backend', body: 'Confirm API and websocket endpoints are reachable.', icon: Wifi, badge: 'Step 2' },
          { title: 'Open APC Panel', body: 'Select the map-based module in the left operations area.', icon: Radar, badge: 'Step 3' },
          { title: 'Verify Output', body: 'Submit frame and observe corrected coordinate response.', icon: Target, badge: 'Step 4' },
        ],
      },
      {
        id: 'apc-flow-sample',
        title: 'APC Flow Sample',
        description:
          'Sample execution path for one APC request from frame capture to fused location output.',
        cards: [
          { title: 'Seed Pose', body: 'Provide approximate latitude, longitude, and heading before submit.', icon: Target },
          { title: 'Submit Frame', body: 'Send frame payload through /apc/frame with provider config.', icon: Video },
          { title: 'Match + Fuse', body: 'Runtime performs matching and EKF stabilization.', icon: GitBranch },
          { title: 'Consume Result', body: 'UI updates corrected track position and confidence.', icon: Eye },
        ],
      },
      {
        id: 'offline-maps-sample',
        title: 'Offline Maps Sample',
        description:
          'Export tile regions and convert them into a visual localization DB for APC operations.',
        cards: [
          { title: 'Draw AOI', body: 'Select bounding box inside offline maps panel.', icon: Map },
          { title: 'Budget Tiles', body: 'Preview count/size before download and export.', icon: SlidersHorizontal },
          { title: 'Build DB', body: 'Export cached satellite tiles into visual DB structure.', icon: Database },
          { title: 'Activate DB', body: 'Switch active map DB path for visual localization.', icon: Radar },
        ],
      },
      {
        id: 'training-sample',
        title: 'Training Sample',
        description:
          'Scaffolded flow for model experimentation and benchmark comparison.',
        cards: [
          { title: 'Configure Run', body: 'Define training config and runtime parameters.', icon: Settings },
          { title: 'Start Pipeline', body: 'Run the training action from the training panel.', icon: CirclePlay },
          { title: 'Benchmark', body: 'Use benchmark runner manifest for baseline comparison.', icon: GitBranch },
          { title: 'Review Metrics', body: 'Inspect validation trend and output artifacts.', icon: Eye },
        ],
      },
      {
        id: 'troubleshooting',
        title: 'Troubleshooting',
        description:
          'Common failure patterns and expected operator checks.',
        cards: [
          { title: 'No Visual Match', body: 'Verify active DB path, imagery quality, and pose seed quality.', icon: Shield },
          { title: 'Backend Timeout', body: 'Validate API URL, websocket URL, and backend process state.', icon: Server },
          { title: 'No Map Tiles', body: 'Re-check offline download bounds and tile cache path.', icon: Globe },
          { title: 'Fallback Triggered', body: 'Inspect provider validation logs and APC mode selection.', icon: Zap },
        ],
      },
    ],
  },
  license: {
    pill: 'Legal And Usage',
    title: 'License',
    description:
      'License posture, dependency notices, and distribution constraints for application usage and integration.',
    navGroups: [
      {
        title: 'Terms',
        icon: Shield,
        items: [
          { label: 'Usage Terms', href: '#usage-terms' },
          { label: 'Distribution Rules', href: '#distribution-rules' },
          { label: 'Attribution', href: '#attribution' },
        ],
      },
      {
        title: 'Compliance',
        icon: BookOpen,
        items: [
          { label: 'Third-Party Notices', href: '#third-party-notices' },
          { label: 'Security And Compliance', href: '#security-and-compliance' },
        ],
      },
    ],
    sections: [
      {
        id: 'usage-terms',
        title: 'Usage Terms',
        description:
          'Operational usage is restricted to approved mission and engineering workflows.',
        cards: [
          { title: 'Internal Use', body: 'Use is intended for approved operators and development teams.', icon: Shield },
          { title: 'Environment Scope', body: 'Deployment should remain in controlled infrastructure.', icon: Server },
        ],
      },
      {
        id: 'third-party-notices',
        title: 'Third-Party Notices',
        description:
          'The stack includes open-source packages, map libraries, and model/runtime dependencies.',
        cards: [
          { title: 'Frontend Libraries', body: 'React, Tailwind, shadcn/ui primitives, and supporting utilities.', icon: Layers3 },
          { title: 'Mapping Stack', body: 'Map rendering and tile tooling dependencies.', icon: Map },
          { title: 'ML/Runtime Modules', body: 'Computer vision and benchmark dependencies in backend runtime.', icon: Radar },
        ],
      },
      {
        id: 'distribution-rules',
        title: 'Distribution Rules',
        description:
          'Redistribution and packaging should preserve applicable notices and policy controls.',
        cards: [
          { title: 'Binary Distribution', body: 'Include required license artifacts and notice documents.', icon: Boxes },
          { title: 'Source Distribution', body: 'Retain copyright headers and attribution markers.', icon: BookOpen },
        ],
      },
      {
        id: 'attribution',
        title: 'Attribution',
        description:
          'Attribution text should remain visible where required by bundled dependencies.',
        cards: [
          { title: 'UI Attribution', body: 'Preserve logo and branding usage rules where applicable.', icon: Eye },
          { title: 'Dependency Attribution', body: 'Maintain third-party acknowledgments in project docs.', icon: BookOpen },
        ],
      },
      {
        id: 'security-and-compliance',
        title: 'Security And Compliance',
        description:
          'Operational release should include routine dependency and vulnerability checks.',
        cards: [
          { title: 'Dependency Hygiene', body: 'Track package versions and security patch cadence.', icon: SlidersHorizontal },
          { title: 'Runtime Controls', body: 'Validate endpoint access control and deployment hardening.', icon: Shield },
        ],
      },
    ],
  },
  changelog: {
    pill: 'Release Notes',
    title: 'Changelog',
    description:
      'Versioned change history for UI workflows, APC behavior, runtime integration, and docs platform updates.',
    navGroups: [
      {
        title: 'Releases',
        icon: GitBranch,
        items: [
          { label: '2026.03', href: '#release-2026-03' },
          { label: '2026.02', href: '#release-2026-02' },
          { label: '2026.01', href: '#release-2026-01' },
        ],
      },
      {
        title: 'Notes',
        icon: BookOpen,
        items: [
          { label: 'Known Issues', href: '#known-issues' },
          { label: 'Upgrade Notes', href: '#upgrade-notes' },
        ],
      },
    ],
    sections: [
      {
        id: 'release-2026-03',
        title: 'Release 2026.03',
        description:
          'Documentation moved to dedicated web route with improved navigation behavior.',
        cards: [
          { title: 'Docs Routing', body: 'Introduced standalone /docs route and top-level page controls.', icon: Home, badge: 'New' },
          { title: 'Scroll Reliability', body: 'Center article uses dedicated scroll viewport with consistent behavior.', icon: ArrowUp, badge: 'Fix' },
          { title: 'Settings Integration', body: 'Help menu now opens full docs page directly.', icon: Settings, badge: 'Update' },
        ],
      },
      {
        id: 'release-2026-02',
        title: 'Release 2026.02',
        description:
          'Expanded APC panel and offline map operations for map DB preparation workflows.',
        cards: [
          { title: 'Map DB Controls', body: 'Added import/export and active DB handling in map module.', icon: Database },
          { title: 'APC Diagnostics', body: 'Improved runtime status and fallback visibility.', icon: Radar },
        ],
      },
      {
        id: 'release-2026-01',
        title: 'Release 2026.01',
        description:
          'Baseline mission workspace and backend scaffolding delivered.',
        cards: [
          { title: 'Workspace Shell', body: 'Vertical app bar, mission canvas, and panel infrastructure.', icon: Layers3 },
          { title: 'Backend APIs', body: 'Initial FastAPI telemetry and control service surface.', icon: Server },
        ],
      },
      {
        id: 'known-issues',
        title: 'Known Issues',
        description:
          'Open observations tracked for future refinement.',
        cards: [
          { title: 'Chunk Size Warnings', body: 'Production bundle still reports large chunk warnings in build output.', icon: SlidersHorizontal },
          { title: 'Future Splitting', body: 'Route-level and feature-level code splitting is pending.', icon: GitBranch },
        ],
      },
      {
        id: 'upgrade-notes',
        title: 'Upgrade Notes',
        description:
          'Guidance for moving between release snapshots.',
        cards: [
          { title: 'Route Compatibility', body: 'Use /docs and /docs/<tab> paths for direct linking.', icon: Globe },
          { title: 'Settings Behavior', body: 'Help menu now exits settings and navigates to docs route.', icon: Settings },
        ],
      },
    ],
  },
};

const SectionCard = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="scroll-mt-8">
    <h2 className="text-3xl font-semibold tracking-tight text-slate-50">{title}</h2>
    <div className="mt-5 text-base leading-8 text-slate-300">{children}</div>
  </section>
);

export const DocumentationPageContent = ({
  onBack,
  onClose,
  topPage = 'guides',
  onTopPageChange,
}: DocumentationPageContentProps) => {
  const articleRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const activePage = topPage === 'guides' ? null : docsPages[topPage];
  const pageNavGroups = activePage?.navGroups ?? guidesNavGroups;
  const pageSections = activePage?.sections.map((section) => ({
    label: section.title,
    href: `#${section.id}`,
  })) ?? guidesPageSections;
  const [activeSection, setActiveSection] = useState(pageSections[0]?.href.replace('#', '') ?? 'platform-overview');

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return null;
    return pageSections.filter((section) => section.label.toLowerCase().includes(query));
  }, [search, pageSections]);

  const getArticleViewport = () =>
    articleRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;

  const scrollToSection = (sectionId: string) => {
    const viewport = getArticleViewport();
    const target = viewport?.querySelector<HTMLElement>(`#${sectionId}`);
    if (!viewport || !target) return;
    viewport.scrollTo({ top: Math.max(0, target.offsetTop - 24), behavior: 'smooth' });
    setActiveSection(sectionId);
  };

  const navSections = filteredSections ?? pageSections;

  useEffect(() => {
    const firstSection = pageSections[0]?.href.replace('#', '') ?? 'platform-overview';
    setActiveSection(firstSection);
    setSearch('');
    getArticleViewport()?.scrollTo({ top: 0, behavior: 'auto' });
  }, [topPage]);

  useEffect(() => {
    const viewport = getArticleViewport();
    if (!viewport) return;

    const handleViewportScroll = () => {
      const currentSection =
        navSections.reduce((active, section) => {
          const sectionId = section.href.replace('#', '');
          const element = viewport.querySelector<HTMLElement>(`#${sectionId}`);
          if (!element) return active;
          return element.offsetTop <= viewport.scrollTop + 80 ? sectionId : active;
        }, navSections[0]?.href.replace('#', '') ?? 'platform-overview') || 'platform-overview';

      setActiveSection(currentSection);
    };

    handleViewportScroll();
    viewport.addEventListener('scroll', handleViewportScroll);
    return () => viewport.removeEventListener('scroll', handleViewportScroll);
  }, [navSections]);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    window.history.back();
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    window.location.assign('/');
  };

  const handleTopPageChange = (page: DocsTopPage) => {
    if (page === topPage) return;
    if (onTopPageChange) {
      onTopPageChange(page);
      return;
    }
    window.location.assign(page === 'guides' ? '/docs' : `/docs/${page}`);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0b1017] text-slate-100">
      <div className="flex h-full flex-col">
          <header className="shrink-0 border-b border-slate-700 bg-[#141b25] px-6 py-4">
            <div className="flex items-center justify-between gap-8">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-sm">
                  <img src={logo} alt="PSYC" className="h-full w-full object-contain" />
                </div>
                <div className="text-[1.15rem] font-semibold tracking-tight text-slate-50 sm:text-[1.45rem] md:text-[1.95rem]">
                  Documentation
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative w-[34rem] max-w-[34rem]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search documentation..."
                    className="h-14 rounded-none border-slate-700 bg-[#0b1017] pl-12 pr-4 text-[1rem] text-slate-200 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <Button
                  variant="outline"
                  className="h-14 rounded-none border-slate-700 bg-[#0b1017] px-6 text-[1rem] font-semibold text-slate-50 hover:bg-slate-900"
                  onClick={() => scrollToSection('platform-overview')}
                >
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Button>
                <Button
                  variant="outline"
                  className="h-14 rounded-none border-slate-700 bg-[#0b1017] px-6 text-[1rem] font-semibold text-slate-50 hover:bg-slate-900"
                  onClick={handleBack}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="outline"
                  className="h-14 rounded-none border-slate-700 bg-[#0b1017] px-6 text-[1rem] font-semibold text-slate-50 hover:bg-slate-900"
                  onClick={handleClose}
                >
                  <X className="mr-2 h-4 w-4" />
                  Close
                </Button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-10 text-[1rem] text-slate-300">
              <div className="flex items-center gap-10">
                {docsTopTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => handleTopPageChange(tab.key)}
                    className={`pb-3 ${
                      topPage === tab.key
                        ? 'border-b-[3px] border-slate-100 font-semibold text-slate-50'
                        : 'text-slate-300 hover:text-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                className="h-10 rounded-none px-4 text-slate-300 hover:bg-slate-900 hover:text-slate-100"
                onClick={() => getArticleViewport()?.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <ArrowUp className="mr-2 h-4 w-4" />
                Top
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex flex-1">
            <aside className="docs-scroll h-full w-[280px] shrink-0 overflow-y-scroll border-r border-slate-700 bg-[#101722] lg:w-[320px]">
              <div className="sticky top-0 space-y-10 px-4 py-6">
                {pageNavGroups.map((group) => (
                  <div key={group.title}>
                    <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      <group.icon className="h-5 w-5" />
                      {group.title}
                    </div>
                    <div className="space-y-1">
                      {group.items
                        .filter((item) => navSections.some((section) => section.href === item.href))
                        .map((item) => (
                          <button
                            key={item.label}
                            onClick={() => scrollToSection(item.href.replace('#', ''))}
                            className={`block w-full px-4 py-3 text-left text-[1rem] transition ${
                              activeSection === item.href.replace('#', '')
                                ? 'bg-slate-800 text-slate-100'
                                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <main className="min-h-0 min-w-0 flex-1 bg-[#0b1017]">
              <ScrollArea ref={articleRef} type="always" className="docs-scroll h-full" style={{ scrollbarGutter: 'stable both-edges' }}>
              <div className="mx-auto max-w-[1120px] px-8 py-10 lg:px-12 lg:py-12">
                <div className="inline-flex rounded-full bg-[#1a2330] px-5 py-2 text-sm text-slate-300">
                  {activePage?.pill ?? 'Platform Documentation'}
                </div>

                <h1 className="mt-8 text-[4rem] font-semibold tracking-tight text-slate-50">{activePage?.title ?? 'Platform'}</h1>
                <p className="mt-6 max-w-5xl text-[1.2rem] leading-[1.7] text-slate-300 sm:text-[1.5rem]">
                  {activePage?.description ??
                    'Mission operations and visual navigation platform with a React control center, FastAPI backend services, APC workflows, map tooling, diagnostics, training scaffolds, and embedded operator documentation.'}
                </p>

                <div className="mt-10 inline-flex h-14 w-20 items-center justify-center bg-[#151d29] text-slate-300">
                  {'</>'}
                </div>

                <div className="mt-16 space-y-16">
                  {topPage === 'guides' ? (
                    <>
                  {navSections.some((section) => section.href === '#platform-overview') && (
                    <SectionCard id="platform-overview" title="Platform Overview">
                      <p>
                        PSYC is a satellite-image-analysis and drift-correction application built for GNSS-denied or degraded navigation workflows. It combines a mission workspace UI, asset and map operations panels, and a backend APC stack that consumes imagery, telemetry, map data, and operator settings.
                      </p>

                      <div className="mt-8 grid gap-5 xl:grid-cols-3">
                        {articleCards.map((card) => {
                          const Icon = card.icon;
                          return (
                            <div key={card.title} className="border border-slate-700 bg-[#121a26] p-8">
                              <div className="flex items-start justify-between gap-4">
                                <Icon className="h-9 w-9 text-cyan-400" />
                                <Badge className="border-0 bg-[#1b2635] px-3 py-1 text-sm text-slate-300 hover:bg-[#1b2635]">
                                  {card.version}
                                </Badge>
                              </div>
                              <div className="mt-8 text-[1.1rem] font-semibold text-slate-50 sm:text-[1.25rem]">{card.title}</div>
                              <p className="mt-4 text-[1rem] leading-8 text-slate-300">{card.body}</p>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-10 grid gap-4 xl:grid-cols-3">
                        {featureCards.map((card) => {
                          const Icon = card.icon;
                          return (
                            <div key={card.title} className="border border-slate-700 bg-[#0f1622] p-6">
                              <div className="flex items-start justify-between gap-4">
                                <Icon className="h-7 w-7 text-cyan-400" />
                                <Badge className="border-0 bg-[#1b2635] px-3 py-1 text-sm text-slate-300 hover:bg-[#1b2635]">
                                  {card.badge}
                                </Badge>
                              </div>
                              <div className="mt-5 text-[1.05rem] font-semibold text-slate-50">{card.title}</div>
                              <p className="mt-3 text-[0.98rem] leading-8 text-slate-300">{card.body}</p>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>
                  )}

                  {navSections.some((section) => section.href === '#workspace-layout') && (
                    <SectionCard id="workspace-layout" title="Workspace Layout">
                      <p>
                        The main screen is organized as an operational workspace. The left vertical app bar opens the active tool area, the center canvas hosts the mission and map view, and the right side supports detail inspection and live controls.
                      </p>
                      <div className="mt-8 grid gap-4">
                        {[
                          ['Top Bar', 'Status indicators, notifications, connectivity, time, operator controls, and access to settings and docs.', Settings],
                          ['Vertical App Bar', 'Primary navigation for assets, training, simulation, offline maps, targeting, and settings access.', Layers3],
                          ['Mission Canvas', 'Central map and mission area where entities, tracks, planning overlays, and map interactions live.', Map],
                          ['Unified Left Panel', 'Dynamic tool region that swaps between APC controls, assets, training, offline map tools, and targeting.', Boxes],
                          ['Detail Views', 'Entity and track side panels provide focused inspection, disposition updates, and tasking actions.', Eye],
                          ['Video And Right Tools', 'Optional video feed and right toolbar support monitoring and context-specific actions during operations.', Video],
                        ].map(([title, body, Icon]) => (
                          <div key={String(title)} className="border border-slate-700 bg-[#121a26] p-6">
                            <Icon className="h-6 w-6 text-cyan-400" />
                            <div className="mt-4 text-[1.05rem] font-semibold text-slate-50">{title}</div>
                            <div className="mt-2 text-[0.98rem] leading-8 text-slate-300">{body}</div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {navSections.some((section) => section.href === '#operations-panels') && (
                    <SectionCard id="operations-panels" title="Operations Panels">
                      <p>
                        The application ships multiple operational panels. They are designed as a control surface around mapping, asset inspection, mission execution, and APC diagnostics rather than as a single-purpose viewer.
                      </p>
                      <div className="mt-8 grid gap-5 lg:grid-cols-2">
                        {[
                          ['Assets Panel', 'Asset browsing and asset-detail views for operational resources and platform state inspection.', Boxes],
                          ['Map-Based Module', 'The core APC panel for map DB management, sensor constraints, live feed setup, visual-localization config, and result diagnostics.', Radar],
                          ['Training Pipeline', 'Dataset ingest, preprocessing, training, evaluation, and export controls for model-development workflows.', SlidersHorizontal],
                          ['Offline Maps', 'Bounding-box capture, tile budgeting, tile download/export workflows, and visual DB preparation from cached tiles.', Globe],
                          ['Targeting', 'Target-centric workflows and context tools for operator decision support.', Target],
                          ['Detail Panels', 'Asset, entity, and track details support focused inspection and action-oriented workflows.', Eye],
                        ].map(([title, body, Icon]) => (
                          <div key={String(title)} className="border border-slate-700 bg-[#121a26] p-6">
                            <Icon className="h-6 w-6 text-cyan-400" />
                            <div className="mt-4 text-[1.05rem] font-semibold text-slate-50">{title}</div>
                            <div className="mt-2 text-[0.98rem] leading-8 text-slate-300">{body}</div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {navSections.some((section) => section.href === '#visual-navigation') && (
                    <SectionCard id="visual-navigation" title="Visual Navigation">
                      <p>
                        Visual navigation is the app&apos;s APC path for drift correction. It receives imagery and pose metadata, optionally runs the vendored visual localization runtime against the active map DB, and fuses the resulting coordinate through the EKF.
                      </p>
                      <div className="mt-8 border border-slate-700 bg-[#0f1622] p-6">
                        <div className="text-[1.1rem] font-semibold text-slate-50">
                          Visual Localization Runtime Flowchart
                        </div>
                        <p className="mt-2 text-[0.95rem] leading-7 text-slate-300">
                          Current structure from map DB selection to fused output, including fallback path when visual matching is unavailable.
                        </p>

                        <div className="relative mt-6">
                          <div className="pointer-events-none absolute left-[1.15rem] top-5 bottom-5 w-px bg-slate-700" />
                          <div className="space-y-4">
                            {visualFlowCards.map((card) => {
                              const Icon = card.icon;
                              return (
                                <div key={`flowchart-${card.title}`} className="relative flex items-start gap-4">
                                  <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-[#121a26]">
                                    <Icon className="h-4 w-4 text-cyan-300" />
                                  </div>
                                  <div className="flex-1 border border-slate-700 bg-[#121a26] px-4 py-3">
                                    <div className="flex items-center justify-between gap-4">
                                      <div className="text-[0.98rem] font-semibold text-slate-50">{card.title}</div>
                                      <Badge className="border-0 bg-[#1b2635] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1b2635]">
                                        {card.badge}
                                      </Badge>
                                    </div>
                                    <div className="mt-2 text-[0.92rem] leading-7 text-slate-300">{card.body}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
                          <div className="border border-slate-700 bg-[#121a26] p-4">
                            <div className="text-sm font-semibold text-slate-50">Match Success Path</div>
                            <p className="mt-2 text-[0.9rem] leading-7 text-slate-300">
                              Stage 5 produces a valid visual coordinate, then Stage 6 EKF fusion publishes the corrected position to UI.
                            </p>
                          </div>
                          <div className="hidden items-center justify-center lg:flex">
                            <ArrowRight className="h-5 w-5 text-slate-400" />
                          </div>
                          <div className="border border-slate-700 bg-[#121a26] p-4">
                            <div className="text-sm font-semibold text-slate-50">Fallback Path</div>
                            <p className="mt-2 text-[0.9rem] leading-7 text-slate-300">
                              If provider checks fail or no valid visual match is produced, APC falls back to native coarse matching / mock correction path.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-8 grid gap-4">
                        {visualFlowCards.map((card) => {
                          const Icon = card.icon;
                          return (
                            <div key={card.title} className="border border-slate-700 bg-[#121a26] p-6">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4">
                                  <div className="rounded-md bg-[#1b2635] p-3">
                                    <Icon className="h-5 w-5 text-slate-100" />
                                  </div>
                                  <div>
                                    <div className="text-[1.05rem] font-semibold text-slate-50">{card.title}</div>
                                    <div className="mt-2 text-[0.98rem] leading-8 text-slate-300">{card.body}</div>
                                  </div>
                                </div>
                                <Badge className="border-0 bg-[#1b2635] px-3 py-1 text-sm text-slate-300 hover:bg-[#1b2635]">
                                  {card.badge}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </SectionCard>
                  )}

                  {navSections.some((section) => section.href === '#backend-services') && (
                    <SectionCard id="backend-services" title="Backend Services">
                      <div className="grid gap-5 lg:grid-cols-3">
                        {[
                          ['Core API', 'FastAPI endpoints for health, telemetry, fleet registration, commands, missions, and APC configuration.', Server],
                          ['APC Runtime', 'REST and websocket APC ingestion, frame preprocessing, coarse matching, EKF fusion, and optional visual localization.', Radar],
                          ['Map Services', 'Tile caching, offline map download, visual DB export, active DB switching, and raster-backed map access.', Database],
                          ['Training APIs', 'Development scaffold endpoints for training status, config, start, and stop actions.', SlidersHorizontal],
                          ['Benchmark Runner', 'Manifest-driven benchmark methods for comparing baselines and future learned matchers.', GitBranch],
                          ['Visual Localization', 'In-process SuperPoint + SuperGlue support through the vendored internal module.', Shield],
                        ].map(([title, body, Icon]) => (
                          <div key={String(title)} className="border border-slate-700 bg-[#121a26] p-6">
                            <Icon className="h-7 w-7 text-cyan-400" />
                            <div className="mt-5 text-[1.05rem] font-semibold text-slate-50">{title}</div>
                            <p className="mt-3 text-[0.98rem] leading-8 text-slate-300">{body}</p>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {navSections.some((section) => section.href === '#run-and-configure') && (
                    <SectionCard id="run-and-configure" title="Run And Configure">
                      <div className="grid gap-5 lg:grid-cols-2">
                        {[
                          ['Run Modes', 'The app supports frontend-only, backend-only, or combined development startup, with the frontend typically on port 8080 and backend on port 9000.', CirclePlay],
                          ['Environment', 'Key configuration includes API base URLs, websocket base URLs, and optional orthomosaic/DEM raster paths for APC raster-backed operation.', Database],
                          ['Frame Inputs', 'Frames can arrive through REST with base64 payloads or through the camera websocket pipeline.', ImageIcon],
                          ['Map Preparation', 'Offline maps can be downloaded, previewed, budgeted, and exported into a visual-localization DB from inside the application workflow.', Globe],
                        ].map(([title, body, Icon]) => (
                          <div key={String(title)} className="border border-slate-700 bg-[#121a26] p-6">
                            <Icon className="h-7 w-7 text-violet-400" />
                            <div className="mt-5 text-[1.05rem] font-semibold text-slate-50">{title}</div>
                            <p className="mt-3 text-[0.98rem] leading-8 text-slate-300">{body}</p>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {navSections.some((section) => section.href === '#settings-and-docs') && (
                    <SectionCard id="settings-and-docs" title="Settings And Docs">
                      <p>
                        Settings are available from both the top bar and the left app bar. The settings dialog includes display, notifications, map, and performance tabs, plus a help entry that opens this documentation workspace.
                      </p>
                      <div className="mt-8 grid gap-5 lg:grid-cols-2">
                        {[
                          ['Display And Preferences', 'Theme, contrast, compact mode, UI scale, notifications, map presentation, and performance controls.', Settings],
                          ['Embedded Documentation', 'Searchable docs workspace for platform explanation, panel usage, backend services, and APC behavior.', BookOpen],
                        ].map(([title, body, Icon]) => (
                          <div key={String(title)} className="border border-slate-700 bg-[#121a26] p-6">
                            <Icon className="h-7 w-7 text-cyan-400" />
                            <div className="mt-5 text-[1.05rem] font-semibold text-slate-50">{title}</div>
                            <p className="mt-3 text-[0.98rem] leading-8 text-slate-300">{body}</p>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {navSections.some((section) => section.href === '#fallback-path') && (
                    <SectionCard id="fallback-path" title="Fallback Path">
                      <div className="grid gap-5 lg:grid-cols-2">
                        {[
                          ['Provider Validations', 'Missing dependencies, invalid DB paths, or disabled provider state prevent the internal visual-localization runtime from executing.', Shield],
                          ['APC Fallback', 'When visual localization cannot run or does not produce a valid result, APC falls back to the native coarse matcher or mock correction path instead of hard-failing the request.', Server],
                        ].map(([title, body, Icon]) => (
                          <div key={String(title)} className="border border-slate-700 bg-[#121a26] p-6">
                            <Icon className="h-7 w-7 text-violet-400" />
                            <div className="mt-5 text-[1.05rem] font-semibold text-slate-50">{title}</div>
                            <p className="mt-3 text-[0.98rem] leading-8 text-slate-300">{body}</p>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}
                    </>
                  ) : (
                    activePage?.sections
                      .filter((section) => navSections.some((item) => item.href === `#${section.id}`))
                      .map((section) => (
                        <SectionCard key={section.id} id={section.id} title={section.title}>
                          <p>{section.description}</p>
                          <div className="mt-8 grid gap-5 lg:grid-cols-2">
                            {section.cards.map((card) => {
                              const Icon = card.icon;
                              return (
                                <div key={card.title} className="border border-slate-700 bg-[#121a26] p-6">
                                  <div className="flex items-start justify-between gap-4">
                                    <Icon className="h-7 w-7 text-cyan-400" />
                                    {card.badge ? (
                                      <Badge className="border-0 bg-[#1b2635] px-3 py-1 text-sm text-slate-300 hover:bg-[#1b2635]">
                                        {card.badge}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="mt-5 text-[1.05rem] font-semibold text-slate-50">{card.title}</div>
                                  <p className="mt-3 text-[0.98rem] leading-8 text-slate-300">{card.body}</p>
                                </div>
                              );
                            })}
                          </div>
                        </SectionCard>
                      ))
                  )}
                </div>
              </div>
              </ScrollArea>
            </main>

            <aside className="docs-scroll h-full w-[260px] shrink-0 overflow-y-scroll border-l border-slate-700 bg-[#101722] lg:w-[280px]">
              <div className="sticky top-0 px-6 py-6">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  On This Page
                </div>
                <div className="mt-7 space-y-6">
                  {navSections.map((section) => (
                    <button
                      key={section.label}
                      onClick={() => scrollToSection(section.href.replace('#', ''))}
                      className={`block text-left text-[1rem] leading-8 ${
                        activeSection === section.href.replace('#', '') ? 'text-slate-200' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
      </div>
    </div>
  );
};
