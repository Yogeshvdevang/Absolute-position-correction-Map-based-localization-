export type SimCameraFramePayload = {
  imageB64: string;
  timestamp: number;
  source: 'bottomClean';
};

const CHANNEL_NAME = 'chaox-sim-camera-feed';

let sharedChannel: BroadcastChannel | null = null;

const getChannel = () => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!sharedChannel) {
    sharedChannel = new BroadcastChannel(CHANNEL_NAME);
  }
  return sharedChannel;
};

export const publishSimCameraFrame = (payload: SimCameraFramePayload) => {
  const channel = getChannel();
  if (!channel) return;
  channel.postMessage(payload);
};

export const subscribeSimCameraFrames = (
  onFrame: (payload: SimCameraFramePayload) => void
) => {
  const channel = getChannel();
  if (!channel) {
    return () => {};
  }

  const handler = (event: MessageEvent<SimCameraFramePayload>) => {
    if (!event.data?.imageB64) return;
    onFrame(event.data);
  };

  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
  };
};
