import { useState, useEffect, useRef } from 'react';
import { VerticalAppBar } from '@/components/VerticalAppBar';
import { UnifiedPanel } from '@/components/UnifiedPanel';
import { MissionCanvas } from '@/components/MissionCanvas';
import { RightToolbar } from '@/components/RightToolbar';
import { VideoFeedPanel } from '@/components/VideoFeedPanel';
import { EntityDetailPanel } from '@/components/EntityDetailPanel';
import { TrackDetailPanel } from '@/components/TrackDetailPanel';
import { SettingsDialog } from '@/components/SettingsDialog';
import { NavisarDashboardPanel } from '@/components/NavisarDashboardPanel';
import { Entity } from '@/types/entity';
import { Track, TrackDisposition } from '@/types/track';

const MIN_WIDTH = 1200;
const MIN_HEIGHT = 700;

const INITIAL_TRACKS: Track[] = [
  {
    id: 'GV13',
    disposition: 'Hostile',
    subtype: 'Ground Vehicle',
    platform: 'BMP3',
    status: 'Live',
    distance: '2km NE of you',
    action: 'View',
    thumbnail: true,
    source: 'On-board',
    quality: 0.82,
    trackingAssets: ['Asset 4', 'Asset 2'],
    sensors: ['Passive', 'Passive'],
    createdAt: new Date(Date.now() - 96000).toISOString(),
    lastUpdated: new Date(Date.now() - 18000).toISOString(),
    environment: 'Unknown',
    heading: 180,
    altitude: 33000,
    speed: 680,
  },
  {
    id: 'GV16',
    disposition: 'Hostile',
    subtype: 'Ground Vehicle',
    platform: 'BMP3',
    status: 'Live',
    distance: '300km NE of you',
    action: 'Assign to',
    source: 'On-board',
    quality: 0.6,
    trackingAssets: ['Asset 1'],
    sensors: ['Passive'],
    createdAt: new Date(Date.now() - 420000).toISOString(),
    lastUpdated: new Date(Date.now() - 65000).toISOString(),
    environment: 'Unknown',
    heading: 135,
    altitude: 1200,
    speed: 90,
  },
  {
    id: 'GV17',
    disposition: 'Hostile',
    subtype: 'Ground Vehicle',
    platform: 'BMP3',
    status: 'Live',
    distance: '300km NE of you',
    action: 'Assign to',
    source: 'On-board',
    quality: 0.55,
    trackingAssets: ['Asset 3'],
    sensors: ['Passive'],
    createdAt: new Date(Date.now() - 220000).toISOString(),
    lastUpdated: new Date(Date.now() - 42000).toISOString(),
    environment: 'Unknown',
    heading: 90,
    altitude: 900,
    speed: 110,
  },
  {
    id: 'GV18',
    disposition: 'Hostile',
    subtype: 'Ground Vehicle',
    platform: 'BMP3',
    status: 'Live',
    distance: '300km NE of you',
    action: 'Assign to',
    source: 'On-board',
    quality: 0.48,
    trackingAssets: ['Asset 5'],
    sensors: ['Passive'],
    createdAt: new Date(Date.now() - 180000).toISOString(),
    lastUpdated: new Date(Date.now() - 38000).toISOString(),
    environment: 'Unknown',
    heading: 210,
    altitude: 1100,
    speed: 95,
  },
  {
    id: 'W001',
    disposition: 'Suspect',
    subtype: 'Ground Vehicle',
    status: 'Live',
    distance: '3km N of S01',
    action: 'Assign to',
    source: 'Remote',
    quality: 0.74,
    trackingAssets: ['Asset 2', 'Asset 5'],
    sensors: ['Passive', 'Passive'],
    createdAt: new Date(Date.now() - 78000).toISOString(),
    lastUpdated: new Date(Date.now() - 12000).toISOString(),
    environment: 'Unknown',
    heading: 45,
    altitude: 800,
    speed: 120,
  },
];

const Index = () => {
  const [isVideoFeedOpen, setIsVideoFeedOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityOverride, setSelectedEntityOverride] = useState<Entity | null>(null);
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offlineDrawActive, setOfflineDrawActive] = useState(false);
  const [offlineBBox, setOfflineBBox] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  const [budgetBBox, setBudgetBBox] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(5.2);
  const [previewImages, setPreviewImages] = useState<{
    min: { url: string; label: string } | null;
    max: { url: string; label: string } | null;
  }>({ min: null, max: null });
  const snapshotGetterRef = useRef<null | (() => string | null)>(null);

  // Calculate scale based on window size
  useEffect(() => {
    const calculateScale = () => {
      const widthScale = window.innerWidth / MIN_WIDTH;
      const heightScale = window.innerHeight / MIN_HEIGHT;
      const newScale = Math.min(widthScale, heightScale, 1);
      setScale(Math.max(newScale, 0.5)); // Minimum 50% scale
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, []);

  const handleBack = () => {
    console.log('Back button clicked');
  };

  const handlePanelSelect = (panel: string) => {
    if (activePanel === panel) {
      setActivePanel(null);
    } else {
      setActivePanel(panel);
    }
  };

  useEffect(() => {
    if (activePanel !== 'offline-maps') {
      setPreviewImages({ min: null, max: null });
    }
  }, [activePanel]);

  const handleCapturePreview = (which: 'min' | 'max', zoom: number) => {
    const snap = snapshotGetterRef.current?.();
    if (!snap) return;
    setPreviewImages(prev => ({
      ...prev,
      [which]: { url: snap, label: `Zoom: ${zoom}` }
    }));
  };

  const handleEntitySelect = (entityId: string, entityOverride?: Entity) => {
    setSelectedEntity(entityId);
    setSelectedEntityOverride(entityOverride ?? null);
    setSelectedTrackId(null);
    setIsDetailPanelOpen(true);
  };

  const selectedEntityData = entities.find(e => e.entity_id === selectedEntity) ?? selectedEntityOverride;
  const selectedTrack = tracks.find(track => track.id === selectedTrackId);

  const handleTrackSelect = (trackId: string) => {
    setSelectedTrackId(trackId);
    setSelectedEntity(null);
    setSelectedEntityOverride(null);
    setIsDetailPanelOpen(false);
  };

  const handleDispositionChange = (trackId: string, disposition: TrackDisposition) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? {
              ...track,
              disposition,
              pendingDisposition: undefined,
              pendingUntil: undefined,
            }
          : track
      )
    );
  };

  const handleTrackTask = (trackId: string, taskedTo: string) => {
    setTracks(prev =>
      prev.map(track => {
        if (track.id !== trackId) return track;
        let suggested: TrackDisposition = track.disposition;
        if (track.disposition === 'Unknown' || track.disposition === 'Neutral') {
          suggested = 'Suspect';
        } else if (track.disposition === 'Suspect') {
          suggested = 'Hostile';
        }
        return {
          ...track,
          taskedTo,
          pendingDisposition: suggested,
          pendingUntil: new Date(Date.now() + 15000).toISOString(),
          lastDetection: new Date().toISOString(),
        };
      })
    );
  };

  const handleOpenProtocolSim = () => {
    window.open('/protocol-sim', '_blank', 'noopener,noreferrer');
  };

  const isNavisarPanel = activePanel === 'navisar';
  const showLeftPanel = Boolean(activePanel) && !isNavisarPanel;

  return (
    <div 
      className="bg-background overflow-hidden"
      style={{
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      <div className="h-screen w-screen flex flex-col">
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-shrink-0">
            <VerticalAppBar
              onBack={handleBack}
              onPanelSelect={handlePanelSelect}
              activePanel={activePanel}
              onOpenProtocolSim={handleOpenProtocolSim}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
          
          {showLeftPanel && (
            <div className="w-72 flex-shrink-0">
              <UnifiedPanel 
                activePanel={activePanel}
                entities={entities}
                onEntitySelect={handleEntitySelect}
                selectedEntity={selectedEntity || undefined}
                tracks={tracks}
                selectedTrackId={selectedTrackId}
                onTrackSelect={handleTrackSelect}
                onTrackTask={handleTrackTask}
                onActivePanelChange={handlePanelSelect}
                offlineDrawActive={offlineDrawActive}
                onOfflineDrawActiveChange={setOfflineDrawActive}
                offlineBBox={offlineBBox}
                onOfflineBBoxChange={setOfflineBBox}
                mapZoom={mapZoom}
                previewImages={previewImages}
                onCapturePreview={handleCapturePreview}
                onBudgetBBoxChange={setBudgetBBox}
              />
            </div>
          )}
          
          <div className="flex-1 flex flex-col min-w-0">
            {isNavisarPanel ? (
              <NavisarDashboardPanel />
            ) : (
              <>
                <div className="flex-1 min-h-0">
                  <MissionCanvas
                    selectedEntity={selectedEntity}
                    onEntitySelect={handleEntitySelect}
                    onEntitiesUpdate={setEntities}
                    offlineDrawActive={offlineDrawActive}
                    offlineBBox={offlineBBox}
                    onOfflineBBoxChange={setOfflineBBox}
                    onOfflineDrawActiveChange={setOfflineDrawActive}
                    onMapZoomChange={setMapZoom}
                    budgetBBox={budgetBBox}
                    onRegisterSnapshot={(fn) => {
                      snapshotGetterRef.current = fn;
                    }}
                  />
                </div>
                {isVideoFeedOpen && <VideoFeedPanel />}
              </>
            )}
          </div>
          
          {!isNavisarPanel && (isDetailPanelOpen || selectedTrack) && (
            <>
              <div className="w-80 flex-shrink-0">
                {selectedTrack ? (
                  <TrackDetailPanel
                    track={selectedTrack}
                    onClose={() => setSelectedTrackId(null)}
                    onDispositionChange={handleDispositionChange}
                  />
                ) : (
                  <EntityDetailPanel
                    entity={selectedEntityData || null}
                    onClose={() => {
                      setIsDetailPanelOpen(false);
                      setSelectedEntity(null);
                      setSelectedEntityOverride(null);
                    }}
                  />
                )}
              </div>
              
              <div className="flex-shrink-0">
                <RightToolbar 
                  onVideoToggle={() => setIsVideoFeedOpen(!isVideoFeedOpen)}
                  isVideoOpen={isVideoFeedOpen}
                  heading={selectedEntityData?.heading ?? 0}
                />
              </div>
            </>
          )}

        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>
    </div>
  );
};

export default Index;
