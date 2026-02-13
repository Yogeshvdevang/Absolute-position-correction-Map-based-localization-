import { useState } from 'react';
import { AssetsPanel } from './AssetsPanel';
import { AssetDetailPanel } from './AssetDetailPanel';
import { MapBasedModulePanel } from './MapBasedModulePanel';
import { TrainingPipelinePanel } from './TrainingPipelinePanel';
import { Entity } from '@/types/entity';
import { Track } from '@/types/track';
interface UnifiedPanelProps {
  activePanel: string | null;
  entities?: Entity[];
  onEntitySelect?: (entityId: string, entityOverride?: Entity) => void;
  selectedEntity?: string;
  tracks?: Track[];
  selectedTrackId?: string | null;
  onTrackSelect?: (trackId: string) => void;
  onTrackTask?: (trackId: string, taskedTo: string) => void;
  onActivePanelChange?: (panel: string) => void;
}
export const UnifiedPanel = ({
  activePanel,
  entities: _entities = [],
  onEntitySelect: _onEntitySelect,
  selectedEntity: _selectedEntity,
  tracks: _tracks = [],
  selectedTrackId: _selectedTrackId,
  onTrackSelect: _onTrackSelect,
  onTrackTask: _onTrackTask,
  onActivePanelChange: _onActivePanelChange
}: UnifiedPanelProps) => {
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const handleBack = () => {
    if (selectedAsset) {
      setSelectedAsset(null);
    } else {
      setSelectedTab(null);
    }
  };
  const handleAssetClick = (asset: any) => {
    setSelectedAsset(asset);
  };

  // Show asset detail if an asset is selected
  if (selectedAsset) {
    return <div className="h-full flex flex-col bg-panel border-r border-panel-border">
        <AssetDetailPanel asset={selectedAsset} onBack={handleBack} />
      </div>;
  }

  if (selectedTab === 'assets' || activePanel === 'assets') {
    return (
      <div className="h-full flex flex-col bg-panel border-r border-panel-border">
        <AssetsPanel hideHeader={false} onAssetClick={handleAssetClick} />
      </div>
    );
  }

  if (activePanel === 'training') {
    return <TrainingPipelinePanel />;
  }

  return (
    <MapBasedModulePanel onOpenAssets={() => setSelectedTab('assets')} />
  );
};
